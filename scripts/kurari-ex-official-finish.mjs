export function explicitFinishRank(row) {
  const value = row?.rank ?? row?.position ?? row?.place;
  if (!/^[1-9]\d*$/u.test(String(value ?? "").trim())) return null;
  return Number(value);
}

export function canonicalWinningMethod(value) {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (/^逃/u.test(text)) return "逃";
  if (/^捲/u.test(text)) return "捲";
  if (/^差/u.test(text)) return "差";
  if (/^(?:マーク|ク)/u.test(text)) return "ク";
  return "";
}

export function officialFinishForStarter(result, starter) {
  if (!Array.isArray(result?.finishOrder)) return null;
  const matches = result.finishOrder.filter(
    (row) => Number(row?.carNo) === Number(starter?.carNo),
  );
  if (matches.length !== 1) return { observed: false, rank: null };
  const row = matches[0];
  if (row.registrationNo !== starter.registrationNo
    || String(row.name ?? "").normalize("NFKC").replace(/\s+/gu, "")
      !== String(starter.name ?? "").normalize("NFKC").replace(/\s+/gu, "")) {
    return { observed: false, rank: null };
  }
  return {
    observed: true,
    rank: explicitFinishRank(row),
    winningMethod: canonicalWinningMethod(row.kimarite),
    status: String(row.status ?? "").trim(),
  };
}

export function compareExplicitFinishOrder(result, carNoA, carNoB) {
  if (result?.status !== "finished" || !Array.isArray(result.finishOrder)) return "unknown-order";
  const a = result.finishOrder.filter((row) => Number(row?.carNo) === Number(carNoA));
  const b = result.finishOrder.filter((row) => Number(row?.carNo) === Number(carNoB));
  if (a.length !== 1 || b.length !== 1) return "unknown-order";
  const rankA = explicitFinishRank(a[0]);
  const rankB = explicitFinishRank(b[0]);
  if (rankA == null || rankB == null || rankA === rankB) return "unknown-order";
  return rankA < rankB ? "a-ahead" : "b-ahead";
}
