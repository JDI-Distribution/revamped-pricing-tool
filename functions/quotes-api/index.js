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
    console.error("GET /quotes error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/quotes", async (req, res) => {
  try {
    const { quote_name, quote_data } = req.body || {};
    if (!quote_name || !quote_data) {
      return res.status(400).json({ error: "quote_name and quote_data are required" });
    }
    const catalystApp = catalyst.initialize(req);

    // Duplicate name check — escape single quotes in the name
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
    console.error("POST /quotes error:", err.message);
    return res.status(500).json({ error: err.message });
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
    console.error("GET /quotes/:id error:", err.message);
    return res.status(500).json({ error: err.message });
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
    console.error("PUT /quotes/:id error:", err.message);
    return res.status(500).json({ error: err.message });
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
    console.error("DELETE /quotes/:id error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

module.exports = app;
