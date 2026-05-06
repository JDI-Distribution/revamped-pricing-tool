"use strict";

const catalyst = require("zcatalyst-sdk-node");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const TABLE = "Quotes";

function json(res, status, body) {
  res.status(status).set(CORS_HEADERS).json(body);
}

function parseId(str) {
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}

module.exports = async (req, res) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(204).set(CORS_HEADERS).send("");
  }

  const app   = catalyst.initialize(req);
  const table = app.datastore().table(TABLE);

  // Route: strip the function-path prefix so we work with /quotes[/:id]
  const raw  = req.path || "/";
  const path = raw.replace(/^\/server\/quotes-api/, "").replace(/^\/quotes-api/, "") || "/";

  // Match /quotes or /quotes/:id
  const baseMatch = path.match(/^\/quotes\/?$/);
  const idMatch   = path.match(/^\/quotes\/(\d+)\/?$/);

  try {
    /* ── GET /quotes — list all ─────────────────────────────────── */
    if (req.method === "GET" && baseMatch) {
      const rows = await table.getTableRows();
      const list = rows.map((r) => ({
        id:          r.ROWID,
        quote_name:  r.quote_name,
        created_at:  r.CREATEDTIME,
        modified_at: r.MODIFIEDTIME,
      }));
      return json(res, 200, list);
    }

    /* ── POST /quotes — create ──────────────────────────────────── */
    if (req.method === "POST" && baseMatch) {
      const { quote_name, quote_data } = req.body || {};
      if (!quote_name || !quote_data) {
        return json(res, 400, { error: "quote_name and quote_data are required" });
      }
      const inserted = await table.insertRow({
        quote_name,
        quote_data: typeof quote_data === "string" ? quote_data : JSON.stringify(quote_data),
      });
      return json(res, 201, {
        id:         inserted.ROWID,
        quote_name: inserted.quote_name,
        created_at: inserted.CREATEDTIME,
      });
    }

    /* ── GET /quotes/:id — fetch one ────────────────────────────── */
    if (req.method === "GET" && idMatch) {
      const id = parseId(idMatch[1]);
      if (!id) return json(res, 400, { error: "Invalid id" });
      const row = await table.getRow(id);
      return json(res, 200, {
        id:          row.ROWID,
        quote_name:  row.quote_name,
        quote_data:  row.quote_data,
        created_at:  row.CREATEDTIME,
        modified_at: row.MODIFIEDTIME,
      });
    }

    /* ── PUT /quotes/:id — update ───────────────────────────────── */
    if (req.method === "PUT" && idMatch) {
      const id = parseId(idMatch[1]);
      if (!id) return json(res, 400, { error: "Invalid id" });
      const { quote_name, quote_data } = req.body || {};
      const payload = {};
      if (quote_name)  payload.quote_name  = quote_name;
      if (quote_data)  payload.quote_data  =
        typeof quote_data === "string" ? quote_data : JSON.stringify(quote_data);
      if (Object.keys(payload).length === 0) {
        return json(res, 400, { error: "Nothing to update" });
      }
      payload.ROWID = id;
      const updated = await table.updateRow(payload);
      return json(res, 200, {
        id:          updated.ROWID,
        quote_name:  updated.quote_name,
        modified_at: updated.MODIFIEDTIME,
      });
    }

    /* ── DELETE /quotes/:id ─────────────────────────────────────── */
    if (req.method === "DELETE" && idMatch) {
      const id = parseId(idMatch[1]);
      if (!id) return json(res, 400, { error: "Invalid id" });
      await table.deleteRow(id);
      return json(res, 200, { deleted: id });
    }

    return json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[quotes-api]", err);
    return json(res, 500, { error: err.message || "Internal server error" });
  }
};
