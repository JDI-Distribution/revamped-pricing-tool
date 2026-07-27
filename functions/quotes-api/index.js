"use strict";
const express = require("express");
const catalyst = require("zcatalyst-sdk-node");

const app = express();
app.use(express.json());

const PACKAGING_COST_TABLE = "Packaging_Cost_Database";
const PACKAGING_AUDIT_TABLE = "Packaging_Cost_Audit";

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

const packagingCostSeedItems = [
  { category: "Packaging", itemName: "4g/5g Jars", description: "", moq: "1639", landedCostEa: 0.13, intakePackoutConfig: "1639/box" },
  { category: "Packaging", itemName: "4g Powder Pump", description: "", moq: "50", landedCostEa: 0.55, intakePackoutConfig: "1080/box" },
  { category: "Packaging", itemName: "4g Powder Spray Bottle", description: "", moq: "50", landedCostEa: 0.55, intakePackoutConfig: "100/box" },
  { category: "Packaging", itemName: "10g Powder Pump", description: "", moq: "100", landedCostEa: 0.68, intakePackoutConfig: "480" },
  { category: "Packaging", itemName: "10g Powder Spray Bottle", description: "", moq: "100", landedCostEa: 0.68, intakePackoutConfig: "600" },
  { category: "Packaging", itemName: "25g Powder Pump", description: "", moq: "10000", landedCostEa: 0.85, intakePackoutConfig: "500" },
  { category: "Packaging", itemName: "25g Powder Spray Bottle", description: "", moq: "10000", landedCostEa: 0.85, intakePackoutConfig: "500" },
  { category: "Packaging", itemName: "White Flip Caps", description: "", moq: "146000", landedCostEa: 0.046, intakePackoutConfig: "2000" },
  { category: "Packaging", itemName: "Black Flip Caps", description: "", moq: "146000", landedCostEa: 0.046, intakePackoutConfig: "2000" },
  { category: "Packaging", itemName: "50g Jars", description: "", moq: "10000", landedCostEa: 0.41, intakePackoutConfig: "480" },
  { category: "Packaging", itemName: "50g Caps", description: "", moq: "10000", landedCostEa: 0.41, intakePackoutConfig: "1216" },
  { category: "Packaging", itemName: "Kilogram Jugs", description: "", moq: "1", landedCostEa: 4.59, intakePackoutConfig: "12/box" },
  { category: "Packaging", itemName: "1lb Jugs", description: "", moq: "1", landedCostEa: 2.9, intakePackoutConfig: "24/box" },
  { category: "Packaging", itemName: "25g Jars", description: "", moq: "480", landedCostEa: 0.6, intakePackoutConfig: "480/box" },
  { category: "Packaging", itemName: "25g Caps", description: "", moq: "2400", landedCostEa: 0.6, intakePackoutConfig: "2400/box" },
  { category: "Packaging", itemName: "4oz Tins", description: "", moq: "5000", landedCostEa: 0.55, intakePackoutConfig: "240//box" },
  { category: "Packaging", itemName: "45g Shakers Bottle", description: "", moq: "500", landedCostEa: 0.43, intakePackoutConfig: "500" },
  { category: "Packaging", itemName: "45g Shaker Caps", description: "", moq: "1400", landedCostEa: 0.43, intakePackoutConfig: "1400" },
  { category: "Packaging", itemName: "White FLAT Caps", description: "", moq: "4000", landedCostEa: 0.43, intakePackoutConfig: "4000" },
  { category: "Packaging", itemName: "Black FLAT Caps", description: "", moq: "4000", landedCostEa: 0.43, intakePackoutConfig: "4000" },
  { category: "Packaging", itemName: "25g pump shrink bands", description: "", moq: "100", landedCostEa: 0.04, intakePackoutConfig: "100" },
  { category: "Labels", itemName: "4x6 (shipping labels)", description: "", moq: "1 roll", landedCostEa: 0.0132, intakePackoutConfig: "250/roll" },
  { category: "Labels", itemName: "3x3 (case pack labels)", description: "", moq: "1 roll", landedCostEa: 0.81, intakePackoutConfig: "500/roll" },
  { category: "Labels", itemName: "Private Label 4g Jar Label", description: "", moq: "3 rolls", landedCostEa: 0.0188691729323308, intakePackoutConfig: "6650/rol" },
  { category: "Labels", itemName: "4g Jar Label", description: "", moq: "3 rolls", landedCostEa: 0.0237613636363636, intakePackoutConfig: "5280/roll" },
  { category: "Labels", itemName: "25G jar, 25G PUMP, 45G", description: "", moq: "3 rolls", landedCostEa: 0.0535140186915888, intakePackoutConfig: "3210/roll" },
  { category: "Labels", itemName: "Pound Bags", description: "", moq: "3 rolls", landedCostEa: 0.0972071428571429, intakePackoutConfig: "1400/roll" },
  { category: "Labels", itemName: "10 g Pump", description: "", moq: "3 rolls", landedCostEa: 0.0305793226381461, intakePackoutConfig: "5610/roll" },
  { category: "Labels", itemName: "4g Pump", description: "", moq: "3 rolls", landedCostEa: 0.02796138996139, intakePackoutConfig: "5180/roll" },
  { category: "Labels", itemName: "Warren Printed Wing tin Labels", description: "", moq: "5 rolls", landedCostEa: 0.10552, intakePackoutConfig: "2000/roll" },
  { category: "Labels", itemName: "Warren Printed Back tin Label", description: "", moq: "5 rolls", landedCostEa: 0.07776, intakePackoutConfig: "1000/roll" },
  { category: "Packaging", itemName: "Hang Tabs", description: "", moq: "29 rolls", landedCostEa: 0.0109, intakePackoutConfig: "3500/roll" },
  { category: "Packaging", itemName: "Production Sugar Sachet Film", description: "", moq: "No Minimum", landedCostEa: 0.0058, intakePackoutConfig: "8,800/roll" },
  { category: "Packaging", itemName: "Center Fold Pillow Pack Film", description: "Used for Michaels tins", moq: "20 rolls", landedCostEa: 124.16, intakePackoutConfig: "Roll" },
  { category: "Packaging", itemName: "13\" Pillow Pack Film", description: "Used for FBA, Walmart, and Michaels blistered units", moq: "96", landedCostEa: 49.13, intakePackoutConfig: "roll" },
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
