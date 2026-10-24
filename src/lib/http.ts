import { NextResponse } from "next/server";
export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};
export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: cors });
export const options = () => new Response(null, { status: 204, headers: cors });
