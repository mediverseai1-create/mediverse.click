import { NextResponse } from "next/server";
import { TEMPLATE_CSV } from "@/lib/import";

export function GET() {
  return new NextResponse(TEMPLATE_CSV, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="mediverse-inventory-template.csv"' },
  });
}
