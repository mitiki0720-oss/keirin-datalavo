import type { PredictionSlotRecord, StructuredPredictionTicket } from "../pages/PageImplementations";
import { parseKeirinCanonicalPredictionBlock } from "./keirinPredictionCanonicalFormat";

type TicketSection = "purchase" | "shadow" | "unknown";
const sectionLabels = { purchase: "買い目", shadow: "影目", unknown: "区分未確認" };
const ticketKey = (ticket: { betType: string; combination: string }) =>
  `${ticket.betType}:${ticket.combination.normalize("NFKC").replace(/\s/g, "")}`;
const indexKey = (index: string) => /^\d+$/.test(index.trim()) ? index.trim().padStart(2, "0") : index.trim();

export function getMobilePredictionPresentation(slot?: Pick<PredictionSlotRecord, "predictionText" | "predictionJson">) {
  const json = slot?.predictionJson;
  const text = slot?.predictionText ?? "";
  const canonical = parseKeirinCanonicalPredictionBlock(text);
  const originalTickets = canonical.isValid ? [...canonical.purchaseTickets, ...canonical.shadowTickets] : [];
  const plan = json?.betPlan?.status === "structured" ? json.betPlan : undefined;
  const purchase = new Set((plan?.purchaseTicketIndices ?? []).map(indexKey));
  const shadow = new Set((plan?.shadowTicketIndices ?? []).map(indexKey));
  const groups: Array<{ section: TicketSection; label: string; tickets: Array<{ ticket: StructuredPredictionTicket; role: string }> }> =
    (["purchase", "shadow", "unknown"] as const).map((section) => ({ section, label: sectionLabels[section], tickets: [] }));

  for (const ticket of json?.tickets ?? []) {
    const original = originalTickets.find((item) => ticketKey(item) === ticketKey(ticket));
    const note = ticket.note?.trim();
    const role = original?.role
      ?? (note && !/[\r\n]/.test(note) && note.length <= 40 ? note : undefined)
      ?? (ticket.group !== "その他" ? ticket.group : undefined)
      ?? "ラベル未記載";
    const index = indexKey(ticket.index);
    const section: TicketSection = plan
      ? purchase.has(index) === shadow.has(index) ? "unknown" : purchase.has(index) ? "purchase" : "shadow"
      : original?.section ?? (/^(影|影目|影買い目)$/.test(role) ? "shadow" : "unknown");
    groups.find((group) => group.section === section)!.tickets.push({ ticket, role });
  }

  const rawGrade = text.match(/^raceSelectGrade\s*:\s*(A|B|C)\s*$/imu)?.[1]?.toUpperCase();
  const jsonGrade = json?.raceMetadata?.raceSelectGrade;
  const grade = jsonGrade && rawGrade && jsonGrade !== rawGrade ? undefined : jsonGrade ?? rawGrade;
  const rawDecision = text.match(/^purchaseDecision\s*:\s*(BUY|VALUE_BUY|SKIP)\s*$/imu)?.[1]?.toUpperCase();
  const jsonDecision = plan?.purchaseDecision ?? json?.raceMetadata?.purchaseDecision;
  const decision = jsonDecision && rawDecision && jsonDecision !== rawDecision ? undefined : jsonDecision ?? rawDecision;
  const decisionLabel = decision === "BUY" ? "購入対象" : decision === "VALUE_BUY" ? "条件付き購入" : decision === "SKIP" ? "見送り" : "購入判断未記載";
  const purchaseCount = groups[0].tickets.length;
  const shadowCount = groups[1].tickets.length;
  const unknownCount = groups[2].tickets.length;
  const summary = unknownCount > 0
    ? `買い目 ${purchaseCount}点 / 影目 ${shadowCount}点 / 区分未確認 ${unknownCount}点`
    : purchaseCount === 0
      ? `買い目なし${shadowCount > 0 ? ` / 影目のみ ${shadowCount}点` : " / 影目なし"}`
      : `買い目 ${purchaseCount}点 / 影目 ${shadowCount}点`;
  return { gradeLabel: grade ? `評価 ${grade}` : "評価未記載", decision, decisionLabel, summary,
    purchaseCount, shadowCount, unknownCount, groups: groups.filter((group) => group.tickets.length > 0) };
}
