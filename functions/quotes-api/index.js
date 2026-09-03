"use strict";
const express = require("express");
const catalyst = require("zcatalyst-sdk-node");

const app = express();
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

const PACKAGING_COST_TABLE = "Packaging_Cost_Database";
const PACKAGING_AUDIT_TABLE = "Packaging_Cost_Audit";
const JDI_EMAIL_DOMAIN = "@jdidistribution.com";
const APP_ACCESS_EMAILS = String(process.env.JDI_PRICING_APP_USERS || "")
  .split(/[,\s;]+/)
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-JDI-Shopify-Secret",
};

app.use((req, res, next) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(204).send("");
  next();
});

const cleanBasicText = (value, max = 255) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
const escapeHtml = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");
const CRM_ORG_ID = cleanBasicText(process.env.ZOHO_CRM_ORG_ID || "648627170", 30);
const normalizeCatalystUser = (user) => {
  if (!user) return null;
  const firstName = cleanBasicText(user.first_name || user.firstName || "");
  const lastName = cleanBasicText(user.last_name || user.lastName || "");
  const email = cleanBasicText(user.email_id || user.email || "", 255).toLowerCase();
  const name = cleanBasicText([firstName, lastName].filter(Boolean).join(" ") || email || user.user_id || "", 255);
  return {
    authenticated: !!email,
    userId: cleanBasicText(user.user_id || user.userId || user.zuid || "", 100),
    firstName,
    lastName,
    name,
    email,
    domainAllowed: email.endsWith(JDI_EMAIL_DOMAIN),
    appAccessAllowed: email.endsWith(JDI_EMAIL_DOMAIN) && (APP_ACCESS_EMAILS.length === 0 || APP_ACCESS_EMAILS.includes(email)),
  };
};

const getSignedInCatalystUser = async (req) => {
  const catalystApp = catalyst.initialize(req);
  return normalizeCatalystUser(await catalystApp.userManagement().getCurrentUser());
};

const requireJdiPdfUser = async (req, res, next) => {
  try {
    const user = await getSignedInCatalystUser(req);
    if (!user?.authenticated) {
      return res.status(401).send("Please sign in with your JDI Distribution account to download this PDF.");
    }
    if (!user.domainAllowed) {
      return res.status(403).send("Only @jdidistribution.com users can download quote PDFs.");
    }
    req.jdiUser = user;
    next();
  } catch (err) {
    return res.status(401).send(err.message || "Please sign in to download this PDF.");
  }
};

const downloadCrmQuotePdf = async (req, res) => {
  try {
    const quoteId = req.query.quoteId || req.query.id;
    if (!quoteId) return res.status(400).send("Missing quoteId");

    const catalystApp = catalyst.initialize(req);
    const credentials = await catalystApp.connections().getConnectionCredentials("zohocrm");
    const headers = credentials.headers;
    const base = "https://www.zohoapis.com/crm/v2";

    const attachmentsRes = await fetch(`${base}/Quotes/${quoteId}/Attachments?fields=id,File_Name,Created_Time`, { headers });
    const attachmentsData = await attachmentsRes.json();
    if (!attachmentsRes.ok) {
      return res.status(attachmentsRes.status).json({ error: "Failed to read Quote attachments", details: attachmentsData });
    }

    const attachments = attachmentsData?.data || [];
    const pdf = attachments
      .filter((item) => String(item.File_Name || "").toLowerCase().endsWith(".pdf"))
      .sort((a, b) => new Date(b.Created_Time || 0).getTime() - new Date(a.Created_Time || 0).getTime())[0];

    if (!pdf?.id) return res.status(404).send("No PDF attachment found for this Quote.");

    const fileRes = await fetch(`${base}/Quotes/${quoteId}/Attachments/${pdf.id}`, { headers });
    if (!fileRes.ok) {
      const text = await fileRes.text();
      return res.status(fileRes.status).send(text || "Failed to download PDF attachment");
    }

    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
    const safeName = String(pdf.File_Name || "quote.pdf").replace(/[^\w.\- ]+/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName.replace(/"/g, "")}"`);
    res.send(fileBuffer);
  } catch (err) {
    console.error("CRM quote PDF download error:", err);
    res.status(500).send(err.message || "Failed to download Quote PDF");
  }
};

const downloadCrmQuotePdfByAppQuote = async (req, res) => {
  try {
    const appQuoteId = cleanBasicText(req.query.appQuoteId || req.query.quoteId || "", 100);
    if (!/^\d+$/.test(appQuoteId)) return res.status(400).send("Missing or invalid appQuoteId");

    const catalystApp = catalyst.initialize(req);
    const rows = await catalystApp.zcql().executeZCQLQuery(
      `SELECT ROWID, quote_data FROM Quotes WHERE ROWID = ${appQuoteId}`
    );
    const quoteRow = rows?.[0]?.Quotes;
    if (!quoteRow?.quote_data) return res.status(404).send("No saved app quote was found.");

    let quoteData = null;
    try {
      quoteData = typeof quoteRow.quote_data === "string" ? JSON.parse(quoteRow.quote_data) : quoteRow.quote_data;
    } catch {
      quoteData = null;
    }

    const crmQuoteId = cleanBasicText(quoteData?.crmQuoteId || "", 100);
    if (!crmQuoteId) return res.status(404).send("This saved app quote has not been linked to a CRM quote yet. Try again in a moment.");

    req.query.quoteId = crmQuoteId;
    return downloadCrmQuotePdf(req, res);
  } catch (err) {
    console.error("CRM quote PDF by app quote download error:", err);
    return res.status(500).send(err.message || "Failed to download Quote PDF");
  }
};

app.get("/auth/me", async (req, res) => {
  try {
    const user = await getSignedInCatalystUser(req);
    if (!user?.authenticated) {
      return res.status(401).json({ authenticated: false, user: null, error: "Not authenticated" });
    }
    if (!user.domainAllowed) {
      return res.status(403).json({ authenticated: true, user, error: "Only @jdidistribution.com users can access this app." });
    }
    if (!user.appAccessAllowed) {
      return res.status(403).json({ authenticated: true, user, error: "This account can download quote PDFs but is not invited to use the pricing tool." });
    }
    return res.status(200).json({ authenticated: true, user });
  } catch (err) {
    console.error("GET /auth/me error:", err.message, JSON.stringify(err, null, 2));
    return res.status(401).json({ authenticated: false, user: null, error: err.message });
  }
});

const requireJdiUser = async (req, res, next) => {
  if (req.path === "/crm/shopify/create-invoice") {
    return next();
  }

  try {
    const user = await getSignedInCatalystUser(req);
    if (!user?.authenticated) {
      return res.status(401).json({ success: false, error: "Please sign in to access JDI Pricing.", authenticated: false });
    }
    if (!user.appAccessAllowed) {
      return res.status(403).json({ success: false, error: "Only invited @jdidistribution.com users can access JDI Pricing.", authenticated: true });
    }
    req.jdiUser = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "Please sign in to access JDI Pricing.", authenticated: false, details: err.message });
  }
};

app.get("/crm/quote-pdf", requireJdiPdfUser, downloadCrmQuotePdf);
app.get("/crm/quote-pdf-by-app-quote", requireJdiPdfUser, downloadCrmQuotePdfByAppQuote);

app.use(requireJdiUser);

app.get("/quotes", async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const rows = await catalystApp.zcql().executeZCQLQuery(
      "SELECT ROWID, quote_name, CREATEDTIME, MODIFIEDTIME FROM Quotes"
    );
    const list = (rows || []).map((r) => ({
      id: r.Quotes.ROWID,
      quote_name: r.Quotes.quote_name,
      created_at: r.Quotes.CREATEDTIME,
      modified_at: r.Quotes.MODIFIEDTIME,
    }));
    return res.status(200).json(list);
  } catch (err) {
    console.error("GET /quotes error:", err.message, JSON.stringify(err, null, 2));
    return res.status(500).json({ error: err.message, details: err });
  }
});

app.get("/crm/quote-status", async (req, res) => {
  try {
    const quoteId = cleanBasicText(req.query.quoteId || req.query.id || "", 100);
    if (!quoteId) return res.status(400).json({ success: false, error: "quoteId is required" });

    const catalystApp = catalyst.initialize(req);
    const credentials = await catalystApp.connections().getConnectionCredentials("zohocrm");
    const headers = credentials.headers;
    const quoteRes = await fetch(
      `https://www.zohoapis.com/crm/v8/Quotes/${quoteId}?fields=id,Subject,Quote_Number,Quote_Stage,Grand_Total`,
      { headers }
    );
    if (quoteRes.status === 204) {
      return res.status(404).json({ success: false, deleted: true, error: "CRM Quote was not found" });
    }
    const quoteData = await quoteRes.json();
    if (!quoteRes.ok) {
      const code = quoteData?.data?.[0]?.code || quoteData?.code || "";
      if (code === "INVALID_DATA" || code === "NOT_FOUND") {
        return res.status(404).json({
          success: false,
          deleted: true,
          error: "CRM Quote was not found",
          details: quoteData,
        });
      }
      return res.status(quoteRes.status).json({
        success: false,
        error: quoteData?.data?.[0]?.message || quoteData?.message || "Failed to read CRM Quote",
        details: quoteData,
      });
    }

    const quote = quoteData?.data?.[0] || {};
    if (!quote?.id) {
      return res.status(404).json({ success: false, deleted: true, error: "CRM Quote was not found", details: quoteData });
    }
    return res.status(200).json({
      success: true,
      quoteId: quote.id || quoteId,
      quoteNumber: quote.Quote_Number || "",
      subject: quote.Subject || "",
      customerApprovalStatus: quote.Quote_Stage || "",
      revenue: quote.Grand_Total ?? null,
    });
  } catch (err) {
    console.error("GET /crm/quote-status error:", err.message, JSON.stringify(err, null, 2));
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/crm/deal-latest-quote-state", async (req, res) => {
  try {
    const dealId = cleanBasicText(req.query.dealId || req.query.crmDealId || "", 100);
    if (!dealId) return res.status(400).json({ success: false, error: "dealId is required" });

    const catalystApp = catalyst.initialize(req);
    const credentials = await catalystApp.connections().getConnectionCredentials("zohocrm");
    const rows = await catalystApp.zcql().executeZCQLQuery(
      "SELECT ROWID, quote_name, quote_data, CREATEDTIME, MODIFIEDTIME FROM Quotes"
    );

    const matches = (rows || [])
      .map((row) => {
        const q = row.Quotes || {};
        let data = null;
        try {
          data = typeof q.quote_data === "string" ? JSON.parse(q.quote_data) : q.quote_data;
        } catch {
          data = null;
        }
        if (!data) return null;
        const linkedDealId = cleanBasicText(data.crmDealId || data.crmAccountId || "", 100);
        if (linkedDealId !== dealId) return null;
        if (data.archivedFromCrm) return null;
        return {
          id: q.ROWID,
          quote_name: q.quote_name,
          quote_data: data,
          created_at: q.CREATEDTIME,
          modified_at: q.MODIFIEDTIME,
          crmQuoteId: data.crmQuoteId || "",
          crmQuoteNumber: data.crmQuoteNumber || "",
          quoteVersion: Number(data.quoteVersion || 0) || 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const versionDelta = (b.quoteVersion || 0) - (a.quoteVersion || 0);
        if (versionDelta !== 0) return versionDelta;
        return new Date(b.modified_at || b.created_at || 0).getTime() - new Date(a.modified_at || a.created_at || 0).getTime();
      });

    const isCrmQuoteActive = async (quoteId) => {
      if (!quoteId) return false;
      try {
        const crmRes = await fetch(`https://www.zohoapis.com/crm/v8/Quotes/${quoteId}?fields=id`, { headers: credentials.headers });
        if (crmRes.status === 204) return false;
        if (!crmRes.ok) return true;
        const crmData = await crmRes.json();
        return !!crmData?.data?.[0]?.id;
      } catch {
        return true;
      }
    };
    const archiveMissingCrmQuote = async (match) => {
      const archived = {
        ...match.quote_data,
        archivedFromCrm: true,
        archivedCrmQuoteId: match.crmQuoteId,
        archivedCrmQuoteNumber: match.crmQuoteNumber,
        archivedAt: new Date().toISOString(),
        archivedReason: "CRM quote no longer exists",
        customerApprovalStatus: "Archived",
        crmQuoteId: "",
        crmQuoteNumber: match.crmQuoteNumber ? `${match.crmQuoteNumber} (archived)` : "",
      };
      try {
        await catalystApp.datastore().table("Quotes").updateRow({
          ROWID: match.id,
          quote_data: JSON.stringify(archived),
        });
      } catch (e) {
        console.error("Failed to archive missing CRM quote state:", e);
      }
    };

    const activeMatches = [];
    for (const match of matches) {
      if (!match.crmQuoteId || await isCrmQuoteActive(match.crmQuoteId)) {
        activeMatches.push(match);
      } else {
        await archiveMissingCrmQuote(match);
      }
    }

    if (activeMatches.length === 0) {
      return res.status(404).json({ success: false, error: "No app-created quote was found for this deal." });
    }

    return res.status(200).json({ success: true, quote: activeMatches[0], count: activeMatches.length });
  } catch (err) {
    console.error("GET /crm/deal-latest-quote-state error:", err.message, JSON.stringify(err, null, 2));
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/crm/quote-state", async (req, res) => {
  try {
    const quoteId = cleanBasicText(req.query.quoteId || req.query.crmQuoteId || "", 100);
    if (!quoteId) return res.status(400).json({ success: false, error: "quoteId is required" });

    const catalystApp = catalyst.initialize(req);
    const rows = await catalystApp.zcql().executeZCQLQuery(
      "SELECT ROWID, quote_name, quote_data, CREATEDTIME, MODIFIEDTIME FROM Quotes"
    );

    const matches = (rows || [])
      .map((row) => {
        const q = row.Quotes || {};
        let data = null;
        try {
          data = typeof q.quote_data === "string" ? JSON.parse(q.quote_data) : q.quote_data;
        } catch {
          data = null;
        }
        if (!data) return null;
        const linkedQuoteId = cleanBasicText(data.crmQuoteId || "", 100);
        if (linkedQuoteId !== quoteId) return null;
        if (data.archivedFromCrm) return null;
        return {
          id: q.ROWID,
          quote_name: q.quote_name,
          quote_data: data,
          created_at: q.CREATEDTIME,
          modified_at: q.MODIFIEDTIME,
          crmQuoteId: data.crmQuoteId || "",
          crmQuoteNumber: data.crmQuoteNumber || "",
          quoteVersion: Number(data.quoteVersion || 0) || 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const versionDelta = (b.quoteVersion || 0) - (a.quoteVersion || 0);
        if (versionDelta !== 0) return versionDelta;
        return new Date(b.modified_at || b.created_at || 0).getTime() - new Date(a.modified_at || a.created_at || 0).getTime();
      });

    if (matches.length === 0) {
      return res.status(404).json({ success: false, error: "No app-created quote state was found for this CRM quote." });
    }

    return res.status(200).json({ success: true, quote: matches[0], count: matches.length });
  } catch (err) {
    console.error("GET /crm/quote-state error:", err.message, JSON.stringify(err, null, 2));
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/quotes", async (req, res) => {
  try {
    const { quote_name, quote_data } = req.body || {};
    if (!quote_name || !quote_data) {
      return res.status(400).json({ error: "quote_name and quote_data are required" });
    }
    const catalystApp = catalyst.initialize(req);

    // Duplicate name check â€” escape single quotes in the name
    const safeName = quote_name.replace(/'/g, "''");
    const existing = await catalystApp.zcql().executeZCQLQuery(
      `SELECT ROWID FROM Quotes WHERE quote_name = '${safeName}'`
    );
    if (existing && existing.length > 0) {
      return res.status(409).json({
        error: `A quote named "${quote_name}" already exists`,
        existing_id: existing[0].Quotes.ROWID,
      });
    }

    const inserted = await catalystApp.datastore().table("Quotes").insertRow({
      quote_name,
      quote_data: typeof quote_data === "string" ? quote_data : JSON.stringify(quote_data),
    });
    return res.status(201).json({
      id: inserted.ROWID,
      quote_name: inserted.quote_name,
      created_at: inserted.CREATEDTIME,
    });
  } catch (err) {
    console.error("POST /quotes error:", err.message, JSON.stringify(err, null, 2));
    return res.status(500).json({ error: err.message, details: err });
  }
});

app.get("/quotes/:id", async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const rows = await catalystApp.zcql().executeZCQLQuery(
      `SELECT ROWID, quote_name, quote_data, CREATEDTIME, MODIFIEDTIME FROM Quotes WHERE ROWID = ${req.params.id}`
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Not found" });
    const r = rows[0].Quotes;
    return res.status(200).json({
      id: r.ROWID,
      quote_name: r.quote_name,
      quote_data: r.quote_data,
      created_at: r.CREATEDTIME,
      modified_at: r.MODIFIEDTIME,
    });
  } catch (err) {
    console.error("GET /quotes/:id error:", err.message, JSON.stringify(err, null, 2));
    return res.status(500).json({ error: err.message, details: err });
  }
});

app.put("/quotes/:id", async (req, res) => {
  try {
    const { quote_name, quote_data } = req.body || {};
    const catalystApp = catalyst.initialize(req);

    // If renaming, check the new name isn't already taken by a different quote
    if (quote_name) {
      const safeName = quote_name.replace(/'/g, "''");
      const existing = await catalystApp.zcql().executeZCQLQuery(
        `SELECT ROWID FROM Quotes WHERE quote_name = '${safeName}'`
      );
      if (existing && existing.length > 0 && existing[0].Quotes.ROWID !== req.params.id) {
        return res.status(409).json({
          error: `A quote named "${quote_name}" already exists`,
          existing_id: existing[0].Quotes.ROWID,
        });
      }
    }

    const payload = { ROWID: req.params.id };
    if (quote_name) payload.quote_name = quote_name;
    if (quote_data) payload.quote_data = typeof quote_data === "string" ? quote_data : JSON.stringify(quote_data);
    const updated = await catalystApp.datastore().table("Quotes").updateRow(payload);
    return res.status(200).json({ id: updated.ROWID, quote_name: updated.quote_name });
  } catch (err) {
    console.error("PUT /quotes/:id error:", err.message, JSON.stringify(err, null, 2));
    return res.status(500).json({ error: err.message, details: err });
  }
});

app.delete("/quotes/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const catalystApp = catalyst.initialize(req);
    await catalystApp.zcql().executeZCQLQuery(
      `DELETE FROM Quotes WHERE ROWID = ${id}`
    );
    return res.status(200).json({ deleted: id });
  } catch (err) {
    console.error("DELETE /quotes/:id error:", err.message, JSON.stringify(err, null, 2));
    return res.status(500).json({ error: err.message, details: err });
  }
});

const packagingCostSeedItems = [
  { category: "Packaging", itemName: "4g Jar", description: "", moq: "", landedCostEa: 0.13, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "5g Jar", description: "", moq: "", landedCostEa: 0.13, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "4g Powder Pump + Spray Bottle", description: "", moq: "", landedCostEa: 0.55, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "10g Powder Pump + Spray Bottle", description: "", moq: "", landedCostEa: 0.68, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "25g Powder Pump + Spray Bottle", description: "", moq: "", landedCostEa: 0.85, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "White Flip Caps", description: "", moq: "", landedCostEa: 0.05, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "Black Flip Caps", description: "", moq: "", landedCostEa: 0.05, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "50g Jars + Caps", description: "", moq: "", landedCostEa: 0.41, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "1kg Jugs", description: "", moq: "", landedCostEa: 4.59, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "1lb Jugs", description: "", moq: "", landedCostEa: 2.9, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "25g Jars + Caps", description: "", moq: "", landedCostEa: 0.6, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "4oz Tins", description: "", moq: "", landedCostEa: 0.55, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "45g Shaker Bottle + Caps", description: "", moq: "", landedCostEa: 0.43, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "White Flat Caps", description: "", moq: "", landedCostEa: 0.43, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "Black Flat Caps", description: "", moq: "", landedCostEa: 0.43, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "25g Pump Shrink Bands", description: "", moq: "", landedCostEa: 0.04, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "Hang Tabs", description: "", moq: "", landedCostEa: 0.01, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "Rimming Sugar Sachet Film", description: "", moq: "", landedCostEa: 0.01, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "Center Fold Pillow Packing Film", description: "Used for Michaels", moq: "", landedCostEa: 124.16, intakePackoutConfig: "" },
  { category: "Packaging", itemName: "13\" Pillow Packing Film", description: "Used for FBA/Walmart/Michaels)", moq: "", landedCostEa: 49.13, intakePackoutConfig: "" },
  { category: "Labels", itemName: "4\" x 6\"", description: "", moq: "", landedCostEa: 0.01, intakePackoutConfig: "" },
  { category: "Labels", itemName: "3\" x 3\"", description: "", moq: "", landedCostEa: 0.81, intakePackoutConfig: "" },
  { category: "Labels", itemName: "Private Label 4g Jar", description: "", moq: "", landedCostEa: 0.02, intakePackoutConfig: "" },
  { category: "Labels", itemName: "4g Jar", description: "", moq: "", landedCostEa: 0.02, intakePackoutConfig: "" },
  { category: "Labels", itemName: "25g Jar", description: "", moq: "", landedCostEa: 0.05, intakePackoutConfig: "" },
  { category: "Labels", itemName: "25g Pump", description: "", moq: "", landedCostEa: 0.05, intakePackoutConfig: "" },
  { category: "Labels", itemName: "45g Jar", description: "", moq: "", landedCostEa: 0.05, intakePackoutConfig: "" },
  { category: "Labels", itemName: "45g Pump", description: "", moq: "", landedCostEa: 0.05, intakePackoutConfig: "" },
  { category: "Labels", itemName: "1lb Bag", description: "", moq: "", landedCostEa: 0.1, intakePackoutConfig: "" },
  { category: "Labels", itemName: "10g Pump", description: "", moq: "", landedCostEa: 0.03, intakePackoutConfig: "" },
  { category: "Labels", itemName: "4g Pump", description: "", moq: "", landedCostEa: 0.03, intakePackoutConfig: "" },
  { category: "Labels", itemName: "Printed Wing Tin Labels", description: "", moq: "", landedCostEa: 0.11, intakePackoutConfig: "" },
  { category: "Labels", itemName: "Printed Black Tin Labels", description: "", moq: "", landedCostEa: 0.08, intakePackoutConfig: "" },
];

function toPackagingRow(item) {
  return {
    Category: item.category || "",
    Item_Name: item.itemName || "",
    Description: item.description || "",
    MOQ: item.moq || "",
    Landed_Cost_Ea: Number(item.landedCostEa) || 0,
    Intake_Packout_Config: item.intakePackoutConfig || "",
  };
}

function fromPackagingRow(row) {
  return {
    id: String(row.ROWID),
    category: row.Category || "",
    itemName: row.Item_Name || "",
    description: row.Description || "",
    moq: row.MOQ || "",
    landedCostEa: Number(row.Landed_Cost_Ea) || 0,
    intakePackoutConfig: row.Intake_Packout_Config || "",
  };
}

function fromAuditRow(row) {
  return {
    id: String(row.ROWID),
    action: row.Action || "",
    itemName: row.Item_Name || "",
    at: row.Event_Time || row.CREATEDTIME || new Date().toISOString(),
    user: row.User_Name || "Current user",
    details: row.Details || row.Item_Name || "",
  };
}

async function insertPackagingAudit(catalystApp, action, itemName, details) {
  try {
    await catalystApp.datastore().table(PACKAGING_AUDIT_TABLE).insertRow({
      Event_Time: new Date().toISOString(),
      User_Name: "Current user",
      Action: action,
      Item_Name: itemName || "",
      Details: details || itemName || "",
    });
  } catch (err) {
    console.error("Packaging audit insert error:", err.message);
  }
}

async function getPackagingItems(catalystApp) {
  const rows = await catalystApp.zcql().executeZCQLQuery(
    `SELECT ROWID, Category, Item_Name, Description, MOQ, Landed_Cost_Ea, Intake_Packout_Config FROM ${PACKAGING_COST_TABLE}`
  );
  return (rows || []).map((result) => fromPackagingRow(result[PACKAGING_COST_TABLE]));
}

app.get("/packaging-costs", async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    let items = await getPackagingItems(catalystApp);
    if (items.length === 0) {
      const table = catalystApp.datastore().table(PACKAGING_COST_TABLE);
      const inserted = [];
      for (const item of packagingCostSeedItems) {
        inserted.push(await table.insertRow(toPackagingRow(item)));
      }
      items = inserted.map(fromPackagingRow);
      await insertPackagingAudit(catalystApp, "Seeded database", "Packaging cost database", `${items.length} rows`);
    }
    items.sort((a, b) => a.itemName.localeCompare(b.itemName));
    return res.status(200).json({ data: items });
  } catch (err) {
    console.error("GET /packaging-costs error:", err.message, JSON.stringify(err, null, 2));
    return res.status(500).json({ error: err.message, details: err });
  }
});

app.post("/packaging-costs", async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const inserted = await catalystApp.datastore().table(PACKAGING_COST_TABLE).insertRow(toPackagingRow(req.body || {}));
    const item = fromPackagingRow(inserted);
    await insertPackagingAudit(catalystApp, "Added row", item.itemName, item.itemName);
    return res.status(201).json({ data: item });
  } catch (err) {
    console.error("POST /packaging-costs error:", err.message, JSON.stringify(err, null, 2));
    return res.status(500).json({ error: err.message, details: err });
  }
});

app.post("/packaging-costs/reset-to-seed", async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const existingItems = await getPackagingItems(catalystApp);
    for (const item of existingItems) {
      await catalystApp.zcql().executeZCQLQuery(
        `DELETE FROM ${PACKAGING_COST_TABLE} WHERE ROWID = ${item.id}`
      );
    }

    const table = catalystApp.datastore().table(PACKAGING_COST_TABLE);
    const inserted = [];
    for (const item of packagingCostSeedItems) {
      inserted.push(await table.insertRow(toPackagingRow(item)));
    }

    const items = inserted.map(fromPackagingRow).sort((a, b) => a.itemName.localeCompare(b.itemName));
    await insertPackagingAudit(
      catalystApp,
      "Replaced database",
      "Packaging cost database",
      `Deleted ${existingItems.length} rows and inserted ${items.length} rows`
    );
    return res.status(200).json({ data: items, deleted: existingItems.length, inserted: items.length });
  } catch (err) {
    console.error("POST /packaging-costs/reset-to-seed error:", err.message, JSON.stringify(err, null, 2));
    return res.status(500).json({ error: err.message, details: err });
  }
});

app.put("/packaging-costs/:id", async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const updated = await catalystApp.datastore().table(PACKAGING_COST_TABLE).updateRow({
      ROWID: req.params.id,
      ...toPackagingRow(req.body || {}),
    });
    const item = fromPackagingRow(updated);
    await insertPackagingAudit(catalystApp, "Updated row", item.itemName, item.itemName);
    return res.status(200).json({ data: item });
  } catch (err) {
    console.error("PUT /packaging-costs/:id error:", err.message, JSON.stringify(err, null, 2));
    return res.status(500).json({ error: err.message, details: err });
  }
});

app.delete("/packaging-costs/:id", async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    await catalystApp.zcql().executeZCQLQuery(
      `DELETE FROM ${PACKAGING_COST_TABLE} WHERE ROWID = ${req.params.id}`
    );
    await insertPackagingAudit(catalystApp, "Deleted row", req.query.name || "Packaging item", req.query.name || req.params.id);
    return res.status(200).json({ deleted: req.params.id });
  } catch (err) {
    console.error("DELETE /packaging-costs/:id error:", err.message, JSON.stringify(err, null, 2));
    return res.status(500).json({ error: err.message, details: err });
  }
});

app.get("/packaging-costs/audit", async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const rows = await catalystApp.zcql().executeZCQLQuery(
      `SELECT ROWID, Event_Time, User_Name, Action, Item_Name, Details, CREATEDTIME FROM ${PACKAGING_AUDIT_TABLE}`
    );
    const audit = (rows || []).map((result) => fromAuditRow(result[PACKAGING_AUDIT_TABLE]));
    audit.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return res.status(200).json({ data: audit.slice(0, 100) });
  } catch (err) {
    console.error("GET /packaging-costs/audit error:", err.message, JSON.stringify(err, null, 2));
    return res.status(500).json({ error: err.message, details: err });
  }
});

app.get("/crm/search-accounts", async (req, res) => {
  const query = req.query.q;
  if (!query || query.length < 2) return res.json({ data: [] });

  try {
    const catalystApp = catalyst.initialize(req);
    const credentials = await catalystApp.connections().getConnectionCredentials("zohocrm");
    const headers = { ...credentials.headers };
    const base = "https://www.zohoapis.com/crm/v2";

    const accountFields = "Account_Name,Auto_Account_Record,Phone,id";
    const accountCriteria = encodeURIComponent(`(Account_Name:contains:${query})`);
    const accountRes = await fetch(
      `${base}/Accounts/search?criteria=${accountCriteria}&fields=${accountFields}`,
      { headers }
    );
    const accountData = await accountRes.json();
    console.log("Account criteria search response:", JSON.stringify(accountData).slice(0, 500));

    let accounts = accountData?.data ?? [];
    if (accounts.length === 0) {
      const wordRes = await fetch(
        `${base}/Accounts/search?word=${encodeURIComponent(query)}&fields=${accountFields}`,
        { headers }
      );
      const wordData = await wordRes.json();
      console.log("Account word search response:", JSON.stringify(wordData).slice(0, 500));
      accounts = wordData?.data ?? [];
    }

    if (accounts.length === 0) {
      const contactRes = await fetch(
        `${base}/Contacts/search?word=${encodeURIComponent(query)}&fields=Full_Name,Email,Phone,Mobile,id,Account_Name&per_page=20`,
        { headers }
      );
      const contactData = await contactRes.json();
      console.log("Contact word search response:", JSON.stringify(contactData).slice(0, 500));
      const contacts = contactData?.data ?? [];
      const accountMap = new Map();
      contacts.forEach((contact) => {
        const accountRef = contact?.Account_Name;
        if (!accountRef?.id || accountMap.has(accountRef.id)) return;
        accountMap.set(accountRef.id, {
          id: accountRef.id,
          Account_Name: accountRef.name,
          Auto_Account_Record: "",
          Phone: "",
        });
      });
      accounts = Array.from(accountMap.values());
    }

    const normalizedQuery = String(query).trim().toLowerCase();
    const seenAccountIds = new Set();
    accounts = accounts.filter((account) => {
      const accountName = String(account?.Account_Name ?? "").toLowerCase();
      const accountId = account?.id;
      if (!accountId || seenAccountIds.has(accountId)) return false;
      if (!accountName.includes(normalizedQuery)) return false;
      seenAccountIds.add(accountId);
      return true;
    });

    const accountResults = await Promise.all(accounts.slice(0, 6).map(async (account) => {
      let contacts = [];
      const relatedContactRes = await fetch(
        `${base}/Accounts/${account.id}/Contacts?fields=Full_Name,Email,Phone,Mobile,id&per_page=20`,
        { headers }
      );
      const relatedContactData = await relatedContactRes.json();
      contacts = relatedContactData?.data ?? [];

      if (contacts.length === 0) {
        const contactCriteria = encodeURIComponent(`(Account_Name:equals:${account.Account_Name})`);
        const contactRes = await fetch(
          `${base}/Contacts/search?criteria=${contactCriteria}&fields=Full_Name,Email,Phone,Mobile,id&per_page=20`,
          { headers }
        );
        const contactData = await contactRes.json();
        contacts = contactData?.data ?? [];
      }

      if (contacts.length === 0) return [{
        accountId: account.id,
        accountName: account.Account_Name,
        customerId: account.Auto_Account_Record ?? "",
        contactName: "",
        phone: account.Phone ?? "",
        email: "",
        contactId: null,
      }];

      return contacts.map((contact) => ({
        accountId: account.id,
        accountName: account.Account_Name,
        customerId: account.Auto_Account_Record ?? "",
        contactName: contact?.Full_Name ?? "",
        phone: contact?.Phone ?? contact?.Mobile ?? account.Phone ?? "",
        email: contact?.Email ?? "",
        contactId: contact?.id ?? null,
      }));
    }));
    const results = accountResults.flat();

    res.json({ data: results });
  } catch (err) {
    console.error("CRM search error:", err.message, err.stack);
    res.json({ data: [], error: err.message });
  }
});

app.get("/crm/search-deals", async (req, res) => {
  const accountIdOrDealId = cleanBasicText(req.query.accountId || req.query.crmAccountId || "", 100);
  const accountName = cleanBasicText(req.query.accountName || req.query.company || req.query.q || "", 255);

  if (!accountIdOrDealId && accountName.length < 2) return res.json({ data: [] });

  try {
    const catalystApp = catalyst.initialize(req);
    const credentials = await catalystApp.connections().getConnectionCredentials("zohocrm");
    const headers = { ...credentials.headers };
    const base = "https://www.zohoapis.com/crm/v2";
    const dealFields = "id,Deal_Name,Stage,Created_Time,Modified_Time,Closing_Date,Account_Name,Contact_Name,Owner";

    const normalizeDeals = (deals) => (deals || [])
      .map((deal) => ({
        dealId: deal.id || "",
        dealName: deal.Deal_Name || "",
        stage: deal.Stage || "",
        createdTime: deal.Created_Time || "",
        modifiedTime: deal.Modified_Time || "",
        closingDate: deal.Closing_Date || "",
        accountId: deal.Account_Name?.id || "",
        accountName: deal.Account_Name?.name || "",
        contactId: deal.Contact_Name?.id || "",
        contactName: deal.Contact_Name?.name || "",
        ownerName: deal.Owner?.name || "",
      }))
      .filter((deal) => deal.dealId && deal.dealName);

    const sortRecent = (deals) => deals.sort((a, b) => (
      new Date(b.modifiedTime || b.createdTime || 0).getTime() -
      new Date(a.modifiedTime || a.createdTime || 0).getTime()
    ));

    let deals = [];
    let accountId = accountIdOrDealId;

    if (accountId) {
      const relatedRes = await fetch(
        `${base}/Accounts/${accountId}/Deals?fields=${dealFields}&per_page=7`,
        { headers }
      );
      const relatedData = await relatedRes.json();
      if (relatedRes.ok) {
        deals = normalizeDeals(relatedData?.data);
      } else {
        const dealRes = await fetch(
          `${base}/Deals/${accountId}?fields=id,Account_Name`,
          { headers }
        );
        const dealData = await dealRes.json();
        accountId = dealData?.data?.[0]?.Account_Name?.id || "";
        if (accountId) {
          const accountDealsRes = await fetch(
            `${base}/Accounts/${accountId}/Deals?fields=${dealFields}&per_page=7`,
            { headers }
          );
          const accountDealsData = await accountDealsRes.json();
          deals = normalizeDeals(accountDealsData?.data);
        }
      }
    }

    if (deals.length === 0 && accountName.length >= 2) {
      const accountCriteria = encodeURIComponent(`(Account_Name:equals:${accountName})`);
      const accountRes = await fetch(
        `${base}/Accounts/search?criteria=${accountCriteria}&fields=id,Account_Name`,
        { headers }
      );
      const accountData = await accountRes.json();
      const accountIds = (accountData?.data || []).map((account) => account.id).filter(Boolean).slice(0, 3);
      const dealGroups = await Promise.all(accountIds.map(async (id) => {
        const relatedRes = await fetch(
          `${base}/Accounts/${id}/Deals?fields=${dealFields}&per_page=7`,
          { headers }
        );
        const relatedData = await relatedRes.json();
        return normalizeDeals(relatedData?.data);
      }));
      deals = dealGroups.flat();
    }

    const seen = new Set();
    const uniqueRecent = sortRecent(deals)
      .filter((deal) => {
        if (seen.has(deal.dealId)) return false;
        seen.add(deal.dealId);
        return true;
      })
      .slice(0, 7);

    return res.status(200).json({ data: uniqueRecent });
  } catch (err) {
    console.error("CRM deal search error:", err.message, err.stack);
    return res.json({ data: [], error: err.message });
  }
});

app.get("/crm/deal-contact", async (req, res) => {
  const dealId = req.query.dealId;
  console.log("=== DEAL CONTACT FETCH ===");
  console.log("Deal ID received:", dealId);

  if (!dealId) return res.json({ data: null });

  try {
    const catalystApp = catalyst.initialize(req);
    const credentials = await catalystApp.connections().getConnectionCredentials("zohocrm");
    const headers = { ...credentials.headers };
    console.log("Connection credentials obtained:", credentials ? "YES" : "NO");
    const base = "https://www.zohoapis.com/crm/v2";

    // 1. Get the Deal to find the Account ID
    const dealUrl = `${base}/Deals/${dealId}?fields=Account_Name,Phone,Mobile,Email`;
    console.log("Fetching deal:", dealUrl);
    const dealRes = await fetch(dealUrl, { headers });
    const dealData = await dealRes.json();
    console.log("Deal response status:", dealRes.status);
    console.log("Deal data:", JSON.stringify(dealData, null, 2));

    const deal = dealData?.data?.[0];
    const accountId = deal?.Account_Name?.id ?? null;
    console.log("Account ID:", accountId);
    console.log("Deal phone:", deal?.Phone);
    console.log("Deal mobile:", deal?.Mobile);
    console.log("Deal email:", deal?.Email);

    // 2. Get contact roles for phone/email
    let phone = "", email = "", contactName = "", contactId = "";
    try {
      const contactUrl = `${base}/Deals/${dealId}/Contact_Roles`;
      console.log("Fetching contact roles:", contactUrl);
      const contactRes = await fetch(contactUrl, { headers });
      const contactData = await contactRes.json();
      console.log("Contact roles status:", contactRes.status);
      console.log("Contact roles data:", JSON.stringify(contactData, null, 2));

      const contact = contactData?.data?.[0];
      console.log("Contact fields:", Object.keys(contact || {}));
      if (contact) {
        phone       = contact.Phone || contact.Mobile || deal?.Phone || deal?.Mobile || "";
        email       = contact.Email || deal?.Email || "";
        contactName = contact.Full_Name || contact.Name || "";
        contactId   = contact.id || "";
      } else {
        phone = deal?.Phone || deal?.Mobile || "";
        email = deal?.Email || "";
      }
    } catch (e) {
      console.error("Contact roles fetch error:", e);
      phone = deal?.Phone || deal?.Mobile || "";
      email = deal?.Email || "";
    }

    // 3. Get the Account's customer number
    let accountNumber = "";
    if (accountId) {
      try {
        const accountUrl = `${base}/Accounts/${accountId}`;
        console.log("Fetching account:", accountUrl);
        const accountRes = await fetch(accountUrl, { headers });
        const accountData = await accountRes.json();
        console.log("Account status:", accountRes.status);
        console.log("Account data:", JSON.stringify(accountData, null, 2));

        const account = accountData?.data?.[0];
        console.log("All account fields:", Object.keys(account || {}));
        accountNumber = account?.Auto_Account_Record
                     || account?.Account_Number
                     || account?.Auto_Number
                     || account?.Customer_ID
                     || "";
        console.log("Account number found:", accountNumber);
      } catch (e) {
        console.error("Account fetch error:", e);
      }
    }

    console.log("Final values:", { phone, email, contactName, contactId, accountNumber });

    res.json({
      data: {
        phone,
        email,
        contactName,
        contactId,
        accountNumber,
      },
    });
  } catch (err) {
    console.error("Deal contact fetch ERROR:", err);
    console.error("Error stack:", err.stack);
    res.json({ data: null });
  }
});

app.post("/crm/push-quote", async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const credentials = await catalystApp.connections().getConnectionCredentials("zohocrm");
    const headers = { ...credentials.headers, "Content-Type": "application/json" };
    const base = "https://www.zohoapis.com/crm/v2";
    const body = req.body;

    const cleanText = (value, max = 255) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
    const asNumber = (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
    const zohoErrorText = (payload) => {
      const first = payload?.data?.[0];
      return first?.message || first?.code || payload?.message || payload?.code || "";
    };
    const cleanNamePart = (value) => cleanText(value, 120).replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ") || "Quote";
    const formatDatePart = (date = new Date()) => {
      const p = (n) => String(n).padStart(2, "0");
      return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
    };
    const formatZohoDateTime = (value) => {
      const date = value ? new Date(value) : new Date();
      if (Number.isNaN(date.getTime())) return null;
      const p = (n) => String(n).padStart(2, "0");
      const offsetMin = -date.getTimezoneOffset();
      const sign = offsetMin >= 0 ? "+" : "-";
      const abs = Math.abs(offsetMin);
      const offset = `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
      return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}${offset}`;
    };
    const getDealQuotes = async (id) => {
      if (!id) return { existingQuotes: [], lookup: { success: false, reason: "No deal ID." } };
      try {
        const relatedRes = await fetch(`${base}/Deals/${id}/Quotes?fields=id,Subject,Quote_Number,Created_Time`, { headers });
        if (relatedRes.status === 204) {
          return { existingQuotes: [], lookup: { success: true, status: relatedRes.status } };
        }
        const relatedData = await relatedRes.json();
        const existingQuotes = Array.isArray(relatedData?.data) ? relatedData.data : [];
        if (!relatedRes.ok && relatedRes.status !== 204) {
          console.error("Deal quote version lookup failed:", relatedRes.status, JSON.stringify(relatedData));
        }
        return {
          existingQuotes,
          lookup: {
            success: relatedRes.ok,
            status: relatedRes.status,
            message: zohoErrorText(relatedData),
            details: relatedRes.ok ? undefined : relatedData,
          },
        };
      } catch (e) {
        console.error("Deal quote version lookup exception:", e);
        return { existingQuotes: [], lookup: { success: false, error: e.message } };
      }
    };
    const getDealQuoteVersion = async (id) => {
      const result = await getDealQuotes(id);
      return { version: result.existingQuotes.length + 1, existingQuotes: result.existingQuotes, lookup: result.lookup };
    };
    const getCrmQuoteDetails = async (id) => {
      if (!id) return null;
      try {
        const quoteLookupRes = await fetch(`${base}/Quotes/${id}?fields=id,Quote_Number,Subject`, { headers });
        const quoteLookupData = await quoteLookupRes.json();
        if (!quoteLookupRes.ok) {
          console.error("CRM Quote detail lookup failed:", quoteLookupRes.status, JSON.stringify(quoteLookupData));
          return null;
        }
        return quoteLookupData?.data?.[0] || null;
      } catch (e) {
        console.error("CRM Quote detail lookup exception:", e);
        return null;
      }
    };
    const getCurrentCatalystUser = async () => {
      try {
        return normalizeCatalystUser(await catalystApp.userManagement().getCurrentUser());
      } catch (e) {
        console.error("Catalyst current user lookup failed:", e);
        return null;
      }
    };
    const resolveCrmUserByEmail = async (email) => {
      const normalizedEmail = cleanText(email, 255).toLowerCase();
      if (!normalizedEmail) return { userId: null, user: null, error: "No approver email was provided." };

      const attempts = [];
      for (const type of ["ActiveUsers", "AllUsers", "CurrentUser"]) {
        const usersRes = await fetch(`https://www.zohoapis.com/crm/v8/users?type=${type}`, { headers });
        const usersData = await usersRes.json();
        const users = Array.isArray(usersData?.users) ? usersData.users : [];
        const seenEmails = users.map(user => String(user.email || "").toLowerCase()).filter(Boolean);
        const match = users.find(user => String(user.email || "").toLowerCase() === normalizedEmail);
        attempts.push({
          type,
          ok: usersRes.ok,
          status: usersRes.status,
          message: zohoErrorText(usersData),
          seenEmails,
          details: usersRes.ok ? undefined : usersData,
        });
        if (usersRes.ok && match?.id) {
          return { userId: match.id, user: match, error: "", attempts };
        }
      }

      const failedAttempt = attempts.find(attempt => !attempt.ok);
      if (failedAttempt) {
        return {
          userId: null,
          user: null,
          status: failedAttempt.status,
          error: `CRM users lookup failed while searching for ${normalizedEmail}: ${failedAttempt.message || `HTTP ${failedAttempt.status}`}.`,
          attempts,
        };
      }

      return {
        userId: null,
        user: null,
        error: `No CRM user email matched ${normalizedEmail}.`,
        attempts,
      };
    };
    const dealId = body.crmDealId || body.crmAccountId || null;
    let contactId = body.crmContactId || null;
    let accountId = null;
    let dealName = "";
    let dealStage = "";

    if (dealId) {
      try {
        const dealLookup = await fetch(
          `${base}/Deals/${dealId}?fields=id,Deal_Name,Stage,Account_Name,Contact_Name`,
          { headers }
        );
        const dealData = await dealLookup.json();
        const deal = dealData?.data?.[0];
        dealName = deal?.Deal_Name || "";
        dealStage = deal?.Stage || "";
        accountId = deal?.Account_Name?.id || null;
        contactId = contactId || deal?.Contact_Name?.id || null;
      } catch (e) {
        console.error("Deal lookup for Quote association failed:", e);
      }
    }

    if (!accountId && body.crmAccountId && body.crmAccountId !== dealId) {
      accountId = body.crmAccountId;
    }

    if (!accountId && body.customerName) {
      const searchRes = await fetch(
        `${base}/Accounts/search?criteria=(Account_Name:equals:${encodeURIComponent(body.customerName)})&fields=id`,
        { headers }
      );
      const searchData = await searchRes.json();
      accountId = searchData?.data?.[0]?.id ?? null;
    }

    if (!accountId) {
      const createRes = await fetch(`${base}/Accounts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ data: [{ Account_Name: body.customerName }] }),
      });
      const createData = await createRes.json();
      accountId = createData?.data?.[0]?.details?.id ?? null;
    }

    if (!contactId && body.email) {
      const contactSearch = await fetch(
        `${base}/Contacts/search?criteria=(Email:equals:${encodeURIComponent(body.email)})&fields=id`,
        { headers }
      );
      const contactData = await contactSearch.json();
      contactId = contactData?.data?.[0]?.id ?? null;

      if (!contactId) {
        const createContact = await fetch(`${base}/Contacts`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            data: [{
              Last_Name: body.contactName || body.customerName,
              Email: body.email,
              Phone: body.phone,
              Account_Name: { id: accountId },
            }],
          }),
        });
        const newContact = await createContact.json();
        contactId = newContact?.data?.[0]?.details?.id ?? null;
      }
    }

    const productCodeForLine = (line) => {
      const explicit = cleanText(line.productCode || line.crmProductCode || "", 80).toUpperCase();
      if (explicit) return explicit;

      const desc = cleanText(line.description || "", 500).toLowerCase();
      if (desc.includes("project setup") || desc.includes("quality assurance")) return "SETUP";
      if (desc.includes("palletization") || desc.includes("outbound")) return "OUTBOUND-PALLET";
      if (desc.startsWith("product filling") || desc.includes("intake")) return "COPACK-PRIMARY";
      if (desc.startsWith("secondary packout")) return "COPACK-SECONDARY";
      if (desc.includes("inner") || desc.includes("case pack")) return "COPACK-INNERS";
      if (desc.includes("shipper")) return "COPACK-SHIPPERS";
      return "PROCESS";
    };

    const productCache = new Map();
    const getProductByCode = async (code) => {
      const normalizedCode = cleanText(code, 80).toUpperCase();
      if (productCache.has(normalizedCode)) return productCache.get(normalizedCode);

      const criteria = encodeURIComponent(`(Product_Code:equals:${normalizedCode})`);
      const productsRes = await fetch(
        `${base}/Products/search?criteria=${criteria}&fields=id,Product_Name,Product_Code`,
        { headers }
      );
      const productsData = await productsRes.json();
      const product = productsData?.data?.[0] || null;
      if (!productsRes.ok || !product?.id) {
        const missing = {
          code: normalizedCode,
          status: productsRes.status,
          message: zohoErrorText(productsData),
          details: productsData,
        };
        productCache.set(normalizedCode, null);
        throw Object.assign(new Error(`Missing CRM Product with Product Code ${normalizedCode}`), { crmProductLookup: missing });
      }

      productCache.set(normalizedCode, product);
      return product;
    };

    const rawLineItems = Array.isArray(body.lineItems) ? body.lineItems : [];
    const quoteLineItems = [];
    for (let idx = 0; idx < rawLineItems.length; idx += 1) {
      const line = rawLineItems[idx] || {};
      const quantity = Math.max(asNumber(line.quantity, 1), 1);
      const unitPrice = asNumber(line.unitPrice, quantity > 0 ? asNumber(line.total, 0) / quantity : asNumber(line.total, 0));
      const productCode = productCodeForLine(line);
      const product = body.crmProductId ? { id: body.crmProductId } : await getProductByCode(productCode);
      quoteLineItems.push({
        product: { id: product.id },
        quantity,
        list_price: unitPrice,
        product_description: cleanText(line.description, 2000),
      });
    }

    if (quoteLineItems.length === 0) {
      const total = asNumber(body.adjustedRevenue || body.totalRevenue, 0);
      const product = body.crmProductId ? { id: body.crmProductId } : await getProductByCode("COPACK-PRIMARY");
      quoteLineItems.push({
        product: { id: product.id },
        quantity: 1,
        list_price: total,
        product_description: cleanText(body.productName || "JDI Quote", 2000),
      });
    }

    let quotePdfUpload = null;
    let quotePdfAttachment = null;
    let quotePdfFieldPayload = null;

    const closingDate = new Date(
      Date.now() + (body.leadTimeWeeks || 4) * 7 * 24 * 60 * 60 * 1000
    ).toISOString().split("T")[0];

    const productLabel = cleanText(body.productName || body.customerName || dealName || "Quote", 160);
    const { version: quoteVersion, existingQuotes, lookup: existingQuoteLookup } = await getDealQuoteVersion(dealId);
    const quoteEventType = existingQuotes.length === 0 ? "First Quote" : "Additional Quote";
    const stagesThatShouldNotAutoMove = ["Quote Created", "Quote Sent", "Invoice Sent", "Final Review", "Closed/Won", "Closed Won", "Closed Lost", "Closed-Lost to Competition"];
    const pdfDownloadUrlFieldApiName = cleanText(body.pdfDownloadUrlFieldApiName || "PDF_Download_URL", 100);
    const appQuotePdfDownloadUrl = body.quoteId && pdfDownloadUrlFieldApiName
      ? `https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/crm/quote-pdf-by-app-quote?appQuoteId=${encodeURIComponent(cleanText(body.quoteId, 100))}`
      : "";
    const dealUrl = dealId
      ? `https://crm.zoho.com/crm/org${CRM_ORG_ID}/tab/Potentials/${encodeURIComponent(cleanText(dealId, 100))}`
      : "";
    const ppuDenominatorLabel = Math.round(asNumber(body.ppuDenominator, 0)).toLocaleString("en-US");
    const humanQuoteName = [
      cleanNamePart(ppuDenominatorLabel),
      cleanNamePart(productLabel),
      cleanNamePart(body.customerName || dealName || "Customer"),
      formatDatePart(),
      `v${quoteVersion}`,
    ].join("_");
    const initialSubject = cleanText(humanQuoteName, 255);
    const approvalStatus = ["Approved", "Rejected"].includes(body.approvalStatus) ? body.approvalStatus : "Draft";
    const approvalDate = body.approvalDate ? new Date(body.approvalDate).toISOString() : null;
    const revisionOfCrmQuoteId = cleanText(body.revisionOfCrmQuoteId || "", 100);
    const revisionOfCrmQuoteNumber = cleanText(body.revisionOfCrmQuoteNumber || "", 100);
    const currentCatalystUser = await getCurrentCatalystUser();
    const approvalBy = cleanText(body.approvalBy || currentCatalystUser?.name || "", 255);
    const approvalByEmail = cleanText(body.approvalByEmail || currentCatalystUser?.email || "", 255).toLowerCase();
    let approvalByCrmUserId = cleanText(body.approvalByCrmUserId || "", 100);
    let approvalUserLookup = null;
    if (!approvalByCrmUserId) {
      approvalUserLookup = await resolveCrmUserByEmail(approvalByEmail);
      approvalByCrmUserId = approvalUserLookup.userId || "";
    }
    const quoteRes = await fetch(`${base}/Quotes`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        data: [{
          Subject: initialSubject,
          Account_Name: { id: accountId },
          Contact_Name: contactId ? { id: contactId } : undefined,
          Deal_Name: dealId ? { id: dealId } : undefined,
          Owner: approvalByCrmUserId ? { id: approvalByCrmUserId } : undefined,
          Quote_Stage: "In review",
          Quote_Event_Type: quoteEventType,
          Valid_Till: closingDate,
          Product_Details: quoteLineItems,
          ...(appQuotePdfDownloadUrl ? { [pdfDownloadUrlFieldApiName]: appQuotePdfDownloadUrl } : {}),
          ...(quotePdfFieldPayload || {}),
          Description: [
            `App Draft ID: ${body.quoteId || "DRAFT"}`,
            `Quote Version: v${quoteVersion}`,
            revisionOfCrmQuoteId ? `Revision Of CRM Quote ID: ${revisionOfCrmQuoteId}` : "",
            revisionOfCrmQuoteNumber ? `Revision Of CRM Quote Number: ${revisionOfCrmQuoteNumber}` : "",
            `Brand: ${body.brand}`,
            `Product: ${body.productName}`,
            dealUrl ? `Deal URL: ${dealUrl}` : "",
            `Project Type: ${body.projectType}`,
            `Total Revenue: ${body.adjustedRevenue || body.totalRevenue || 0}`,
            `Our Cost: ${body.ourCost}`,
            `Margin: ${body.marginPercent}%`,
            `Lead Time: ${body.leadTimeWeeks} wks`,
          ].filter(Boolean).join("\n"),
        }],
      }),
    });
    const quoteData = await quoteRes.json();
    const quoteId = quoteData?.data?.[0]?.details?.id;

    if (!quoteRes.ok || !quoteId) {
      console.error("CRM Quote create failed:", quoteRes.status, JSON.stringify(quoteData));
      return res.status(quoteRes.status || 500).json({
        success: false,
        error: quoteData?.data?.[0]?.message || quoteData?.message || "Failed to create CRM Quote",
        details: quoteData,
      });
    }

    const createdQuote = await getCrmQuoteDetails(quoteId);
    const postCreateDealQuotes = await getDealQuotes(dealId);
    const quotesOtherThanThisOne = postCreateDealQuotes.existingQuotes.filter((quote) => String(quote.id || "") !== String(quoteId));
    const isFirstQuoteForDeal = dealId && quotesOtherThanThisOne.length === 0;
    const resolvedQuoteEventType = isFirstQuoteForDeal ? "First Quote" : quoteEventType;
    const shouldMoveDealToQuoteCreated = isFirstQuoteForDeal && !stagesThatShouldNotAutoMove.includes(dealStage);
    let dealStageUpdate = null;
    if (shouldMoveDealToQuoteCreated) {
      try {
        const stageUpdateRes = await fetch(`${base}/Deals/${dealId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            data: [{
              Stage: "Quote Created",
            }],
          }),
        });
        const stageUpdateData = await stageUpdateRes.json();
        dealStageUpdate = {
          success: stageUpdateRes.ok && stageUpdateData?.data?.[0]?.status === "success",
          previousStage: dealStage,
          stage: "Quote Created",
          status: stageUpdateRes.status,
          message: zohoErrorText(stageUpdateData),
          firstQuoteForDeal: !!isFirstQuoteForDeal,
          preCreateQuoteCount: existingQuotes.length,
          postCreateOtherQuoteCount: quotesOtherThanThisOne.length,
          details: stageUpdateData,
        };
      } catch (e) {
        console.error("CRM Deal stage update failed:", e);
        dealStageUpdate = {
          success: false,
          previousStage: dealStage,
          stage: "Quote Created",
          error: e.message,
          firstQuoteForDeal: !!isFirstQuoteForDeal,
          preCreateQuoteCount: existingQuotes.length,
          postCreateOtherQuoteCount: quotesOtherThanThisOne.length,
        };
      }
    } else {
      dealStageUpdate = {
        success: false,
        skipped: true,
        reason: !dealId
          ? "No deal was linked."
          : !isFirstQuoteForDeal
            ? "Deal already had other quotes."
            : `Deal stage '${dealStage || "unknown"}' should not be auto-moved.`,
        previousStage: dealStage,
        firstQuoteForDeal: !!isFirstQuoteForDeal,
        preCreateQuoteCount: existingQuotes.length,
        preCreateLookup: existingQuoteLookup,
        postCreateQuoteCount: postCreateDealQuotes.existingQuotes.length,
        postCreateOtherQuoteCount: quotesOtherThanThisOne.length,
        postCreateLookup: postCreateDealQuotes.lookup,
      };
    }
    const quoteNumber = cleanText(createdQuote?.Quote_Number || quoteId, 100);
    const displayQuoteNumber = quoteNumber.length > 8 && /^\d+$/.test(quoteNumber)
      ? quoteNumber.slice(-6)
      : quoteNumber;
    const officialSubject = cleanText(humanQuoteName, 255);

    let approvalStatusUpdate = null;
    try {
      const updateApprovalFields = async (payload, label) => {
        const updateRes = await fetch(`https://www.zohoapis.com/crm/v8/Quotes/${quoteId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ data: [payload] }),
        });
        const updateData = await updateRes.json();
        return {
          label,
          payload,
          success: updateRes.ok && updateData?.data?.[0]?.status === "success",
          status: updateRes.status,
          message: zohoErrorText(updateData),
          details: updateData,
        };
      };

      const attempts = [];
      attempts.push(await updateApprovalFields({ Approval_Status: approvalStatus }, "Approval_Status"));

      if (approvalStatus !== "Draft" && !approvalByCrmUserId) {
        throw Object.assign(
          new Error(approvalUserLookup?.error || `No CRM user was found for approver ${approvalByEmail || approvalBy || "unknown"}.`),
          { approvalUserLookup }
        );
      }

      if (approvalStatus !== "Draft") {
        const formattedApprovalDate = formatZohoDateTime(approvalDate);
        if (formattedApprovalDate) {
          attempts.push(await updateApprovalFields({ Approved_Date: formattedApprovalDate }, "Approved_Date"));
        }
        attempts.push(await updateApprovalFields({ Approved_By: { id: approvalByCrmUserId } }, "Approved_By"));
      }

      const failedAttempt = attempts.find((attempt) => !attempt.success);
      approvalStatusUpdate = {
        success: !failedAttempt,
        status: failedAttempt?.status || 200,
        approvalUserLookup,
        message: failedAttempt ? `${failedAttempt.label}: ${failedAttempt.message || "CRM rejected the field value"}` : "",
        attempts,
      };
    } catch (e) {
      console.error("CRM Quote approval status update failed:", e);
      approvalStatusUpdate = { success: false, error: e.message, approvalUserLookup: e.approvalUserLookup || approvalUserLookup };
    }

    if (quotePdfFieldPayload && quotePdfUpload?.fileId) {
      const updateRes = await fetch(`https://www.zohoapis.com/crm/v8/Quotes/${quoteId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          data: [quotePdfFieldPayload],
        }),
      });
      const updateData = await updateRes.json();
      quotePdfUpload = {
        ...quotePdfUpload,
        stage: "quote-field-update",
        updateSuccess: updateRes.ok && updateData?.data?.[0]?.status === "success",
        updateStatus: updateRes.status,
        updateDetails: updateData,
      };
    }

    const pdfDownloadUrl = `https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/crm/quote-pdf?quoteId=${encodeURIComponent(quoteId)}`;
    let pdfDownloadUrlUpdate = null;
    if (pdfDownloadUrlFieldApiName) {
      try {
        const urlUpdateRes = await fetch(`https://www.zohoapis.com/crm/v8/Quotes/${quoteId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            data: [{
              Subject: officialSubject,
              Quote_Event_Type: resolvedQuoteEventType,
              [pdfDownloadUrlFieldApiName]: pdfDownloadUrl,
            }],
          }),
        });
        const urlUpdateData = await urlUpdateRes.json();
        pdfDownloadUrlUpdate = {
          success: urlUpdateRes.ok && urlUpdateData?.data?.[0]?.status === "success",
          fieldApiName: pdfDownloadUrlFieldApiName,
          status: urlUpdateRes.status,
          message: zohoErrorText(urlUpdateData),
          details: urlUpdateData,
        };
      } catch (e) {
        console.error("CRM Quote PDF URL update failed:", e);
        pdfDownloadUrlUpdate = { success: false, fieldApiName: pdfDownloadUrlFieldApiName, error: e.message };
      }
    }

    res.json({
      success: true,
      quoteId,
      quoteNumber,
      displayQuoteNumber,
      displayQuoteLabel: humanQuoteName,
      quoteVersion,
      quoteEventType: resolvedQuoteEventType,
      officialSubject,
      existingQuoteCount: quotesOtherThanThisOne.length,
      dealStageUpdate,
      dealUrl,
      dealId,
      accountId,
      contactId,
      quotePdfUpload,
      quotePdfAttachment,
      pdfDownloadUrl,
      pdfDownloadUrlUpdate,
      approvalStatusUpdate,
    });
  } catch (err) {
    console.error("CRM push error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/crm/upload-quote-pdf", async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const credentials = await catalystApp.connections().getConnectionCredentials("zohocrm");
    const headers = { ...credentials.headers, "Content-Type": "application/json" };
    const base = "https://www.zohoapis.com/crm/v2";
    const body = req.body || {};
    const cleanText = (value, max = 255) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
    const zohoErrorText = (payload) => {
      const first = payload?.data?.[0];
      return first?.message || first?.code || payload?.message || payload?.code || "";
    };

    const quoteId = cleanText(body.quoteId || "", 100);
    if (!quoteId) return res.status(400).json({ success: false, error: "quoteId is required" });
    if (!body.quotePdf?.base64) return res.status(400).json({ success: false, error: "quotePdf.base64 is required" });

    const quoteNumber = cleanText(body.quoteNumber || quoteId, 100);
    const pdfFieldApiName = cleanText(body.quotePdf.fieldApiName || "Quote_PDF", 100);
    const pdfDownloadUrlFieldApiName = cleanText(body.pdfDownloadUrlFieldApiName || "PDF_Download_URL", 100);
    const fallbackName = `${quoteNumber}-${body.productName || body.customerName || "quote"}.pdf`;
    const filename = cleanText(body.quotePdf.filename || fallbackName, 180) || "quote.pdf";
    const contentType = body.quotePdf.contentType || "application/pdf";
    const fileBuffer = Buffer.from(String(body.quotePdf.base64), "base64");

    const uploadMultipart = async (url, boundaryPrefix) => {
      const boundary = `----${boundaryPrefix}${Date.now().toString(36)}`;
      const multipartHead = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename.replace(/"/g, "")}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`
      );
      const multipartTail = Buffer.from(`\r\n--${boundary}--\r\n`);
      const multipartBody = Buffer.concat([multipartHead, fileBuffer, multipartTail]);
      return fetch(url, {
        method: "POST",
        headers: {
          ...credentials.headers,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: multipartBody,
      });
    };

    const fileRes = await uploadMultipart("https://www.zohoapis.com/crm/v8/files", "jdiquote");
    const fileData = await fileRes.json();
    const fileId = fileData?.data?.[0]?.details?.id
      || fileData?.data?.[0]?.details?.file_id
      || fileData?.data?.[0]?.File_Id__s;
    const quotePdfUpload = {
      success: fileRes.ok && !!fileId,
      stage: "file-upload",
      fieldApiName: pdfFieldApiName,
      fileId,
      status: fileRes.status,
      message: zohoErrorText(fileData),
      details: fileData,
    };

    let quotePdfAttachment = null;
    const attachmentRes = await uploadMultipart(`${base}/Quotes/${quoteId}/Attachments`, "jdiattach");
    const attachmentData = await attachmentRes.json();
    const attachmentId = attachmentData?.data?.[0]?.details?.id;
    quotePdfAttachment = {
      success: attachmentRes.ok && !!attachmentId,
      status: attachmentRes.status,
      attachmentId,
      filename,
      message: zohoErrorText(attachmentData),
      details: attachmentData,
    };

    let quotePdfFieldUpdate = null;
    if (fileId) {
      const updateRes = await fetch(`https://www.zohoapis.com/crm/v8/Quotes/${quoteId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          data: [{
            [pdfFieldApiName]: [{ File_Id__s: fileId }],
          }],
        }),
      });
      const updateData = await updateRes.json();
      quotePdfFieldUpdate = {
        success: updateRes.ok && updateData?.data?.[0]?.status === "success",
        status: updateRes.status,
        message: zohoErrorText(updateData),
        details: updateData,
      };
    }

    const pdfDownloadUrl = `https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/crm/quote-pdf?quoteId=${encodeURIComponent(quoteId)}`;
    let pdfDownloadUrlUpdate = null;
    if (pdfDownloadUrlFieldApiName) {
      const urlUpdateRes = await fetch(`https://www.zohoapis.com/crm/v8/Quotes/${quoteId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          data: [{
            [pdfDownloadUrlFieldApiName]: pdfDownloadUrl,
          }],
        }),
      });
      const urlUpdateData = await urlUpdateRes.json();
      pdfDownloadUrlUpdate = {
        success: urlUpdateRes.ok && urlUpdateData?.data?.[0]?.status === "success",
        fieldApiName: pdfDownloadUrlFieldApiName,
        status: urlUpdateRes.status,
        message: zohoErrorText(urlUpdateData),
        details: urlUpdateData,
      };
    }

    return res.json({
      success: quotePdfUpload.success || quotePdfAttachment.success,
      quoteId,
      quoteNumber,
      quotePdfUpload,
      quotePdfFieldUpdate,
      quotePdfAttachment,
      pdfDownloadUrl,
      pdfDownloadUrlUpdate,
    });
  } catch (err) {
    console.error("CRM PDF upload error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to upload Quote PDF" });
  }
});

app.all("/crm/shopify/create-invoice", async (req, res) => {
  const quoteIdForFailure = cleanBasicText(req.body?.quoteId || req.query?.quoteId || "", 100);
  try {
    const shopDomain = cleanBasicText(process.env.SHOPIFY_SHOP_DOMAIN || "bakell-llc.myshopify.com", 120);
    const configuredShopifyToken = cleanBasicText(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "", 500);
    const shopifyClientId = cleanBasicText(process.env.SHOPIFY_CLIENT_ID || "", 500);
    const shopifyClientSecret = cleanBasicText(process.env.SHOPIFY_CLIENT_SECRET || "", 1000);
    const apiVersion = cleanBasicText(process.env.SHOPIFY_API_VERSION || "2026-07", 20);
    const getShopifyAccessToken = async () => {
      if (configuredShopifyToken) return configuredShopifyToken;
      if (!shopifyClientId || !shopifyClientSecret) {
        throw new Error("Shopify credentials are not configured in Catalyst. Add SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET, or SHOPIFY_ADMIN_ACCESS_TOKEN.");
      }

      const tokenRes = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: shopifyClientId,
          client_secret: shopifyClientSecret,
        }),
      });
      const tokenText = await tokenRes.text();
      let tokenData = null;
      try {
        tokenData = tokenText ? JSON.parse(tokenText) : null;
      } catch {
        tokenData = null;
      }
      if (!tokenRes.ok || !tokenData?.access_token) {
        const details = tokenData?.error_description || tokenData?.error || tokenText || `HTTP ${tokenRes.status}`;
        throw new Error(`Shopify access token request failed: ${details}`);
      }
      return cleanBasicText(tokenData.access_token, 500);
    };
    const shopifyToken = await getShopifyAccessToken();

    const quoteId = quoteIdForFailure;
    if (!quoteId) return res.status(400).json({ success: false, error: "quoteId is required" });

    const catalystApp = catalyst.initialize(req);
    const credentials = await catalystApp.connections().getConnectionCredentials("zohocrm");
    const crmHeaders = { ...credentials.headers, "Content-Type": "application/json" };
    const crmBase = "https://www.zohoapis.com/crm/v2";
    const crmV8Base = "https://www.zohoapis.com/crm/v8";

    const zohoErrorText = (payload) => {
      const first = payload?.data?.[0];
      return first?.message || first?.code || payload?.message || payload?.code || "";
    };
    const readResponsePayload = async (response) => {
      const text = await response.text();
      if (!text) return { data: null, text: "" };
      try {
        return { data: JSON.parse(text), text };
      } catch (e) {
        return { data: null, text };
      }
    };
    const updateQuoteShopifyFields = async (fields) => {
      const updateRes = await fetch(`${crmV8Base}/Quotes/${quoteId}`, {
        method: "PUT",
        headers: crmHeaders,
        body: JSON.stringify({ data: [fields] }),
      });
      const { data: updateData, text: updateText } = await readResponsePayload(updateRes);
      return {
        success: updateRes.ok && updateData?.data?.[0]?.status === "success",
        status: updateRes.status,
        message: zohoErrorText(updateData) || updateText.slice(0, 500),
        details: updateData || updateText,
      };
    };
    const failAndWrite = async (message, details = {}) => {
      const update = await updateQuoteShopifyFields({
        Shopify_Invoice_Status: "Failed",
        Shopify_Invoice_Error: cleanBasicText(message, 4000),
      });
      return res.status(400).json({ success: false, error: message, details, crmUpdate: update });
    };

    const quoteRes = await fetch(
      `${crmBase}/Quotes/${quoteId}?fields=id,Subject,Quote_Number,Account_Name,Contact_Name,Product_Details,Grand_Total`,
      { headers: credentials.headers }
    );
    const { data: quoteData, text: quoteText } = await readResponsePayload(quoteRes);
    const quote = quoteData?.data?.[0];
    if (!quoteRes.ok || !quote) {
      return failAndWrite(`Could not fetch CRM quote ${quoteId}: ${zohoErrorText(quoteData) || quoteText.slice(0, 500) || `HTTP ${quoteRes.status}`}`, quoteData || quoteText);
    }

    const quoteSubject = cleanBasicText(quote.Subject || `CRM Quote ${quoteId}`, 255);
    const productDetails = Array.isArray(quote.Product_Details) ? quote.Product_Details : [];
    if (productDetails.length === 0) {
      return failAndWrite("No quoted items were found on this CRM quote.");
    }

    let contactEmail = "";
    let customerName = cleanBasicText(quote.Account_Name?.name || "", 255);
    if (quote.Contact_Name?.id) {
      try {
        const contactRes = await fetch(`${crmBase}/Contacts/${quote.Contact_Name.id}?fields=id,Email,Full_Name,First_Name,Last_Name`, { headers: credentials.headers });
        const { data: contactData } = await readResponsePayload(contactRes);
        const contact = contactData?.data?.[0];
        contactEmail = cleanBasicText(contact?.Email || "", 255);
      } catch (e) {
        console.error("CRM contact lookup for Shopify invoice failed:", e);
      }
    }

    const shopifyHeaders = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopifyToken,
    };
    const draftOrderUrl = `https://${shopDomain}/admin/api/${apiVersion}/draft_orders.json`;

    const lineItems = [];
    const missingSkus = [];
    for (const line of productDetails) {
      const product = line.product || line.Product_Name || {};
      const sku = cleanBasicText(product.Product_Code || line.Product_Code || "", 100);
      const productName = cleanBasicText(product.name || line.product_name || "Quoted item", 255);
      const description = cleanBasicText(line.product_description || productName, 1000);
      const quantity = Math.max(Number(line.quantity || line.Quantity || 1) || 1, 1);
      const lineTotal = Number(
        line.total_after_discount
        || line.Total_After_Discount
        || line.net_total
        || line.Net_Total
        || line.total
        || line.Total
        || 0
      ) || 0;
      const candidatePrices = [
        Number(line.list_price || line.List_Price || 0),
        Number(line.unit_price || line.Unit_Price || 0),
        lineTotal > 0 && quantity > 0 ? lineTotal / quantity : 0,
      ];
      const price = candidatePrices.find(value => Number.isFinite(value) && value > 0) || 0;

      if (!sku) {
        missingSkus.push(`Missing SKU for ${description}`);
        continue;
      }

      if (price <= 0) {
        missingSkus.push(`Missing quote price for SKU ${sku}`);
        continue;
      }

      lineItems.push({
        title: description || productName,
        quantity,
        price: price.toFixed(2),
        sku,
        requires_shipping: true,
        taxable: false,
        properties: [
          { name: "CRM Quote Line", value: description },
          { name: "CRM SKU", value: sku },
          { name: "CRM Product", value: productName },
        ],
      });
    }

    if (missingSkus.length > 0) {
      return failAndWrite(missingSkus.join("; "), { missingSkus });
    }

    const draftOrderPayload = {
      draft_order: {
        line_items: lineItems,
        email: contactEmail || undefined,
        note: "",
        tags: ["Zoho CRM Quote", customerName, quote.Quote_Number || quoteId].filter(Boolean).join(", "),
        note_attributes: [
          { name: "CRM Quote ID", value: quoteId },
          { name: "CRM Quote Number", value: cleanBasicText(quote.Quote_Number || "", 100) },
          { name: "CRM Quote Subject", value: quoteSubject },
        ],
      },
    };

    const draftRes = await fetch(draftOrderUrl, {
      method: "POST",
      headers: shopifyHeaders,
      body: JSON.stringify(draftOrderPayload),
    });
    const { data: draftData, text: draftText } = await readResponsePayload(draftRes);
    const draftOrder = draftData?.draft_order;
    if (!draftRes.ok || !draftOrder?.id) {
      return failAndWrite(`Shopify draft order creation failed: ${draftData?.errors ? JSON.stringify(draftData.errors) : draftText.slice(0, 1500) || `HTTP ${draftRes.status}`}`, draftData || draftText);
    }
    const shopHandle = shopDomain.replace(/\.myshopify\.com$/i, "").replace(/[^a-zA-Z0-9-]/g, "");
    const draftOrderAdminUrl = shopHandle
      ? `https://admin.shopify.com/store/${shopHandle}/draft_orders/${draftOrder.id}`
      : `https://${shopDomain}/admin/draft_orders/${draftOrder.id}`;

    const crmUpdate = await updateQuoteShopifyFields({
      Shopify_Draft_Order_ID: String(draftOrder.id || ""),
      Shopify_Draft_Order_Number: cleanBasicText(draftOrder.name || draftOrder.order_number || "", 100),
      Shopify_Invoice_URL: cleanBasicText(draftOrder.invoice_url || draftOrder.admin_graphql_api_id || "", 1000),
      Shopify_Invoice_Status: "Draft Created",
      Shopify_Invoice_Created_At: draftOrder.created_at || new Date().toISOString(),
      Shopify_Invoice_Error: "",
    });

    if (["1", "true", "yes"].includes(String(req.query?.redirect || "").toLowerCase())) {
      const safeUrl = escapeHtml(draftOrderAdminUrl);
      const safeNumber = escapeHtml(draftOrder.name || "draft order");
      const safeQuoteSubject = escapeHtml(quoteSubject);
      const safeQuoteNumber = escapeHtml(quote.Quote_Number || quoteId);
      const safeCustomerName = escapeHtml(customerName || "Not set");
      const currencyCode = escapeHtml(draftOrder.currency || quote.Currency || "USD");
      const draftTotal = Number(draftOrder.total_price || draftOrder.subtotal_price || quote.Grand_Total || 0) || 0;
      const quoteTotal = Number(quote.Grand_Total || 0) || 0;
      const formatCurrency = (value) => `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const safeDraftTotal = escapeHtml(formatCurrency(draftTotal));
      const safeQuoteTotal = escapeHtml(formatCurrency(quoteTotal));
      const safeLineCount = escapeHtml(String(lineItems.length));
      return res.status(200).type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Opening Shopify Draft Order</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      main { max-width: 720px; margin: 10vh auto; padding: 28px; background: white; border: 1px solid #dbe3ef; border-radius: 10px; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.12); }
      h1 { font-size: 22px; margin: 0 0 8px; }
      p { color: #475569; line-height: 1.5; margin: 0 0 18px; }
      .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin: 18px 0; }
      .item { padding: 14px 16px; border-bottom: 1px solid #e2e8f0; }
      .item:nth-child(odd) { border-right: 1px solid #e2e8f0; }
      .item:nth-last-child(-n+2) { border-bottom: 0; }
      .label { display: block; color: #64748b; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 6px; }
      .value { display: block; font-size: 16px; font-weight: 700; overflow-wrap: anywhere; }
      .muted { color: #64748b; font-weight: 400; }
      .actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
      a.button { display: inline-block; color: white; background: #ef513b; text-decoration: none; padding: 11px 15px; border-radius: 6px; font-weight: 700; }
      a.secondary { color: #334155; text-decoration: none; font-weight: 700; }
      @media (max-width: 640px) {
        main { margin: 0; min-height: 100vh; border-radius: 0; box-shadow: none; }
        .summary { grid-template-columns: 1fr; }
        .item:nth-child(odd) { border-right: 0; }
        .item:nth-last-child(2) { border-bottom: 1px solid #e2e8f0; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Shopify draft order created</h1>
      <p>Opening ${safeNumber} in a new Shopify tab. If it does not open automatically, use the button below.</p>
      <div class="summary">
        <div class="item">
          <span class="label">Draft Order</span>
          <span class="value">${safeNumber}</span>
        </div>
        <div class="item">
          <span class="label">Draft Total</span>
          <span class="value">${safeDraftTotal} <span class="muted">${currencyCode}</span></span>
        </div>
        <div class="item">
          <span class="label">CRM Quote</span>
          <span class="value">${safeQuoteNumber}</span>
        </div>
        <div class="item">
          <span class="label">CRM Quote Total</span>
          <span class="value">${safeQuoteTotal}</span>
        </div>
        <div class="item">
          <span class="label">Customer</span>
          <span class="value">${safeCustomerName}</span>
        </div>
        <div class="item">
          <span class="label">Line Items</span>
          <span class="value">${safeLineCount}</span>
        </div>
        <div class="item" style="grid-column: 1 / -1;">
          <span class="label">Quote Name</span>
          <span class="value">${safeQuoteSubject}</span>
        </div>
      </div>
      <div class="actions">
        <a class="button" href="${safeUrl}" target="_blank" rel="noopener">Open Shopify Draft Order</a>
        <a class="secondary" href="javascript:window.close()">Close this page</a>
      </div>
    </main>
    <script>
      const shopifyUrl = ${JSON.stringify(draftOrderAdminUrl)};
      const opened = window.open(shopifyUrl, "_blank", "noopener");
      if (!opened) {
        document.querySelector("p").textContent = "Your browser blocked the new tab. Opening the Shopify draft order in this tab instead.";
        window.setTimeout(() => window.location.replace(shopifyUrl), 700);
      }
    </script>
  </body>
</html>`);
    }

    return res.json({
      success: true,
      quoteId,
      draftOrderId: draftOrder.id,
      draftOrderNumber: draftOrder.name || "",
      invoiceUrl: draftOrder.invoice_url || "",
      draftOrderAdminUrl,
      crmUpdate,
    });
  } catch (err) {
    console.error("Shopify invoice creation error:", err);
    try {
      if (quoteIdForFailure) {
        const catalystApp = catalyst.initialize(req);
        const credentials = await catalystApp.connections().getConnectionCredentials("zohocrm");
        await fetch(`https://www.zohoapis.com/crm/v8/Quotes/${quoteIdForFailure}`, {
          method: "PUT",
          headers: { ...credentials.headers, "Content-Type": "application/json" },
          body: JSON.stringify({ data: [{ Shopify_Invoice_Status: "Failed", Shopify_Invoice_Error: cleanBasicText(err.message || "Shopify invoice creation failed.", 4000) }] }),
        });
      }
    } catch (writeErr) {
      console.error("Failed to write Shopify invoice error to CRM:", writeErr);
    }
    return res.status(500).json({ success: false, error: err.message || "Shopify invoice creation failed." });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

module.exports = app;
