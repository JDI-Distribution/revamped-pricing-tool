"use strict";
const express = require("express");
const catalyst = require("zcatalyst-sdk-node");

const app = express();
app.use(express.json());

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

app.use((req, res, next) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(204).send("");
  next();
});

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

app.get("/crm/search-accounts", async (req, res) => {
  const query = req.query.q;
  if (!query || query.length < 2) return res.json({ data: [] });

  try {
    const catalystApp = catalyst.initialize(req);
    const credentials = await catalystApp.connections().getConnectionCredentials("zohocrm");
    const headers = { ...credentials.headers };
    const base = "https://www.zohoapis.com/crm/v2";

    const accountRes = await fetch(
      `${base}/Accounts/search?criteria=(Account_Name:starts_with:${encodeURIComponent(query)})&fields=Account_Name,Auto_Account_Record,Phone,id`,
      { headers }
    );
    const accountData = await accountRes.json();
    const accounts = accountData?.data ?? [];

    const results = await Promise.all(accounts.slice(0, 6).map(async (account) => {
      const contactRes = await fetch(
        `${base}/Contacts/search?criteria=(Account_Name:equals:${encodeURIComponent(account.Account_Name)})&fields=Full_Name,Email,Phone,id&per_page=1`,
        { headers }
      );
      const contactData = await contactRes.json();
      const contact = contactData?.data?.[0] ?? null;
      return {
        accountId: account.id,
        accountName: account.Account_Name,
        customerId: account.Auto_Account_Record ?? "",
        contactName: contact?.Full_Name ?? "",
        phone: contact?.Phone ?? account.Phone ?? "",
        email: contact?.Email ?? "",
        contactId: contact?.id ?? null,
      };
    }));

    res.json({ data: results });
  } catch (err) {
    console.error("CRM search error:", err);
    res.json({ data: [] });
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

    let contactId = body.crmContactId || null;
    let accountId = body.crmAccountId || null;

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

    const closingDate = new Date(
      Date.now() + (body.leadTimeWeeks || 4) * 7 * 24 * 60 * 60 * 1000
    ).toISOString().split("T")[0];

    const dealRes = await fetch(`${base}/Deals`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        data: [{
          Deal_Name: `${body.quoteId} â€“ ${body.productName || body.customerName}`,
          Account_Name: { id: accountId },
          Contact_Name: contactId ? { id: contactId } : undefined,
          Amount: body.adjustedRevenue || body.totalRevenue || 0,
          Closing_Date: closingDate,
          Stage: "Proposal/Price Quote",
          Description: [
            `Quote ID: ${body.quoteId}`,
            `Brand: ${body.brand}`,
            `Product: ${body.productName}`,
            `Project Type: ${body.projectType}`,
            `Our Cost: ${body.ourCost}`,
            `Margin: ${body.marginPercent}%`,
            `Lead Time: ${body.leadTimeWeeks} wks`,
          ].join("\n"),
        }],
      }),
    });
    const dealData = await dealRes.json();
    const dealId = dealData?.data?.[0]?.details?.id;

    res.json({ success: true, dealId, accountId, contactId });
  } catch (err) {
    console.error("CRM push error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

module.exports = app;
