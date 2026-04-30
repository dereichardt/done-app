type ParsedReceipt = {
  vendor: string;
  serviceDate: string;
  amount: number;
  currency: string;
  confidence: {
    vendor: number;
    serviceDate: number;
    amount: number;
  };
};

function parseReceiptText(text: string): ParsedReceipt {
  const vendorLine = text.split("\n")[0]?.trim() || "Unknown Vendor";
  const amountMatch = text.match(/\$?\s?(\d+[.,]\d{2})/);
  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\/\d{2}\/\d{4})/);
  const normalizedDate = dateMatch
    ? dateMatch[0].includes("/")
      ? dateMatch[0].split("/").reverse().join("-")
      : dateMatch[0]
    : new Date().toISOString().slice(0, 10);

  return {
    vendor: vendorLine,
    serviceDate: normalizedDate,
    amount: amountMatch ? Number(amountMatch[1].replace(",", ".")) : 0,
    currency: "USD",
    confidence: {
      vendor: vendorLine === "Unknown Vendor" ? 0.2 : 0.8,
      serviceDate: dateMatch ? 0.8 : 0.3,
      amount: amountMatch ? 0.85 : 0.2
    }
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" }
    });
  }

  const payload = await request.json().catch(() => null);
  const receiptText = typeof payload?.rawText === "string" ? payload.rawText : "";
  const parsed = parseReceiptText(receiptText);

  return new Response(JSON.stringify(parsed), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
});
