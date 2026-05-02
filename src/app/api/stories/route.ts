import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/server/auth";
import { getPool } from "@/lib/server/db";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM behavioral_stories WHERE user_id = $1 ORDER BY updated_at DESC",
    [user.id]
  );
  return NextResponse.json({ stories: rows });
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, situation, task, action, result, category } = body;

  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO behavioral_stories (user_id, title, situation, task, action, result, category)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [user.id, title, situation, task, action, result, category || "General"]
  );
  return NextResponse.json(rows[0]);
}

export async function PUT(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, title, situation, task, action, result, category } = body;

  if (!id || !title) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const pool = getPool();
  const { rowCount, rows } = await pool.query(
    `UPDATE behavioral_stories 
     SET title = $1, situation = $2, task = $3, action = $4, result = $5, category = $6, updated_at = NOW()
     WHERE id = $7 AND user_id = $8
     RETURNING *`,
    [title, situation, task, action, result, category, id, user.id]
  );

  if (rowCount === 0) return NextResponse.json({ error: "Story not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  const pool = getPool();
  await pool.query("DELETE FROM behavioral_stories WHERE id = $1 AND user_id = $2", [id, user.id]);
  return NextResponse.json({ success: true });
}
