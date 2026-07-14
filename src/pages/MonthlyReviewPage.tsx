import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { buildMonthlyPredictionGuidance, loadMonthlyReviewIndex, loadMonthlyReviewText, parseMonthlyReviewDigest } from "../lib/monthlyReviewInsights";
import type { MonthlyReviewDigest, MonthlyReviewIndexItem } from "../types/monthlyReview";
import { PAGE_MAX_WIDTH, SiteHeader, useIsMobile } from "./PageImplementations";

const cardStyle: CSSProperties = {
  border: "1px solid rgba(211, 222, 238, 0.86)",
  background: "rgba(255, 255, 255, 0.92)",
  boxShadow: "0 18px 44px rgba(38, 50, 69, 0.08)",
};

const fallbackDigest: MonthlyReviewDigest = {
  stableCohort: "未取得",
  hitRateAny: "未取得",
  hitRate3tan: "未取得",
  hitRate2tan: "未取得",
  thirdOnlyMiss: "未取得",
  headMiss: "未取得",
  targetHitRateAny: "未取得",
  targetHitRate3tan: "未取得",
  targetHitRate2tan: "未取得",
  targetRecoveryRate: "未取得",
  targetThirdOnlyMiss: "未取得",
  fixedFormat: "基本18点 / 14〜20点可変 / 原則3連単のみ / 1点100円固定",
  mission: "的中率の最大化ではなく、払戻単価と回収率を改善する",
  rawText: "",
};

const metricCards = (digest: MonthlyReviewDigest) => [
  { label: "STABLE COHORT", value: digest.stableCohort || "未取得", note: "安定評価対象" },
  { label: "ANY HIT RATE", value: digest.hitRateAny || "未取得", note: "いずれか的中" },
  { label: "3TAN HIT RATE", value: digest.hitRate3tan || "未取得", note: "3連単的中" },
  { label: "THIRD-ONLY MISS", value: digest.thirdOnlyMiss || "未取得", note: "3着抜け" },
];

const playbookItems = [
  { title: "FIRM 14", body: "堅そうなレース。安め本線4点、中穴8点、大穴2点。超大穴と2車単は原則入れない。" },
  { title: "STANDARD 18", body: "基本形。安め本線4点、中穴8点、大穴4点、超大穴2点。中心は3連単50〜199倍。" },
  { title: "VOLATILE 20", body: "荒れ含みレース。安め3点、中穴8点、大穴6点、超大穴3点まで。根拠が明確な時だけ。" },
];

const raceTypeItems = [
  { title: "FIRM_14", body: "🔥🔥🔥かつ💎なし。安め4 + 中穴8 + 大穴2。堅いレースで18点買いすぎない。" },
  { title: "STANDARD_18", body: "🔥🔥かつ💎あり。安め4 + 中穴8 + 大穴4 + 超大穴2の基本形。" },
  { title: "VALUE_18", body: "🔥かつ💎💎。50〜199倍を主戦場にして、中穴枠を厚く使う。" },
  { title: "VOLATILE_18_20", body: "🔥 / 💎 / ⚡あり。200〜999倍を混ぜ、1000倍超えは1〜3点だけ。" },
  { title: "CAUTIOUS_14_16", body: "🔥なし / ⚡⚡。穴狙いでも慎重に14〜16点へ抑える。" },
];

export default function MonthlyReviewPage() {
  const isMobile = useIsMobile();
  const [indexItems, setIndexItems] = useState<MonthlyReviewIndexItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reportText, setReportText] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => {
    let isActive = true;

    const loadIndex = async () => {
      try {
        const items = await loadMonthlyReviewIndex();
        if (!isActive) return;
        setIndexItems(items);
        const activeItem = items.find((item) => item.status === "active") ?? items[0];
        setSelectedId(activeItem?.id ?? "");
        setStatus(activeItem ? "loading" : "empty");
      } catch {
        if (!isActive) return;
        setStatus("error");
      }
    };

    loadIndex();

    return () => {
      isActive = false;
    };
  }, []);

  const selectedItem = useMemo(
    () => indexItems.find((item) => item.id === selectedId) ?? indexItems[0] ?? null,
    [indexItems, selectedId]
  );

  useEffect(() => {
    if (!selectedItem) return;
    let isActive = true;
    setStatus("loading");

    loadMonthlyReviewText(selectedItem.file)
      .then((text) => {
        if (!isActive) return;
        setReportText(text);
        setStatus("ready");
      })
      .catch(() => {
        if (!isActive) return;
        setReportText("");
        setStatus("error");
      });

    return () => {
      isActive = false;
    };
  }, [selectedItem]);

  const digest = useMemo(
    () => (reportText.trim() ? parseMonthlyReviewDigest(reportText) : fallbackDigest),
    [reportText]
  );
  const guidancePreview = useMemo(
    () => buildMonthlyPredictionGuidance({ digest, lineup: "ライン未取得", hasVenueMaster: true, hasReviewSummary: true, hasRegisteredRiderMemo: true }),
    [digest]
  );

  const shellPadding = isMobile ? "18px 16px 36px" : "28px 24px 56px";
  const gridTwo = isMobile ? "1fr" : "minmax(0, 1.18fr) minmax(340px, 0.82fr)";

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f8fbff 0%, #fff8fc 48%, #f1fbf7 100%)", color: "#111827" }}>
      <SiteHeader activeKey="monthly" />
      <main style={{ maxWidth: PAGE_MAX_WIDTH, margin: "0 auto", padding: shellPadding, display: "grid", gap: "22px" }}>
        <section style={{ display: "grid", gridTemplateColumns: gridTwo, gap: "22px", alignItems: "stretch" }}>
          <div style={{ ...cardStyle, borderRadius: "28px", padding: isMobile ? "24px" : "34px", display: "grid", alignContent: "space-between", minHeight: isMobile ? "auto" : "340px" }}>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 950, letterSpacing: "0.18em", color: "#6577c8", marginBottom: "14px" }}>MONTHLY RETROSPECTIVE</div>
              <h1 style={{ margin: 0, fontSize: isMobile ? "30px" : "48px", lineHeight: 1.12, letterSpacing: 0, color: "#071120" }}>月次振り返り・予想改善ラボ</h1>
              <p style={{ margin: "18px 0 0", color: "#506177", fontSize: isMobile ? "14px" : "16px", lineHeight: 1.9, maxWidth: "820px" }}>
                直近の的中傾向を月次で固定化し、予想ページの GPT MATERIAL へ必要な注意点だけを反映します。Review ページとは分離した、改善ルールの保管場所です。
              </p>
            </div>
            <div style={{ marginTop: "24px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ borderRadius: "9999px", padding: "9px 13px", background: "#eef6ff", color: "#285e91", border: "1px solid #cfe3fb", fontSize: "11px", fontWeight: 900 }}>{selectedItem?.month ?? "未登録"}</span>
              <span style={{ borderRadius: "9999px", padding: "9px 13px", background: status === "ready" ? "#ecfdf5" : "#fff7ed", color: status === "ready" ? "#047857" : "#9a3412", border: status === "ready" ? "1px solid #a7f3d0" : "1px solid #fed7aa", fontSize: "11px", fontWeight: 900 }}>
                {status === "ready" ? "月次振り返り: 反映済み" : status === "loading" ? "月次振り返り: 読み込み中" : "月次振り返り: 未登録"}
              </span>
              <span style={{ borderRadius: "9999px", padding: "9px 13px", background: "#f4f1ff", color: "#6b57a8", border: "1px solid #ddd3f0", fontSize: "11px", fontWeight: 900 }}>可変点数ルール v2026-07</span>
              <span style={{ borderRadius: "9999px", padding: "9px 13px", background: "#eef6ff", color: "#285e91", border: "1px solid #cfe3fb", fontSize: "11px", fontWeight: 900 }}>基本18点 / 14〜20点可変</span>
              <span style={{ borderRadius: "9999px", padding: "9px 13px", background: "#f0fdf4", color: "#167047", border: "1px solid #bbf7d0", fontSize: "11px", fontWeight: 900 }}>1点100円固定</span>
              <span style={{ borderRadius: "9999px", padding: "9px 13px", background: "#fff7ed", color: "#9a4f12", border: "1px solid #fed7aa", fontSize: "11px", fontWeight: 900 }}>3連単配当寄せへ更新済み</span>
              <span style={{ borderRadius: "9999px", padding: "9px 13px", background: "#fef2f2", color: "#b42318", border: "1px solid #fecaca", fontSize: "11px", fontWeight: 900 }}>2車単は原則なし</span>
              <span style={{ borderRadius: "9999px", padding: "9px 13px", background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", fontSize: "11px", fontWeight: 900 }}>GPT素材へ反映済み</span>
            </div>
          </div>

          <aside style={{ ...cardStyle, borderRadius: "28px", padding: "24px", display: "grid", gap: "12px" }}>
            {selectedItem ? (
              <label style={{ display: "grid", gap: "8px" }}>
                <span style={{ fontSize: "10px", fontWeight: 950, letterSpacing: "0.14em", color: "#69778b" }}>REPORT</span>
                <select value={selectedItem.id} onChange={(event) => setSelectedId(event.target.value)} style={{ width: "100%", borderRadius: "14px", border: "1px solid #d8e2ef", padding: "12px 14px", color: "#172033", background: "#fff", fontWeight: 800 }}>
                  {indexItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.month} / {item.title}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {metricCards(digest).map((item) => (
              <div key={item.label} style={{ borderRadius: "18px", border: "1px solid #dde9f5", background: "linear-gradient(135deg, rgba(245, 250, 255, 0.96) 0%, rgba(248, 255, 251, 0.96) 100%)", padding: "16px" }}>
                <div style={{ fontSize: "10px", fontWeight: 950, letterSpacing: "0.13em", color: "#667085", marginBottom: "8px" }}>{item.label}</div>
                <div style={{ fontSize: "28px", fontWeight: 950, color: "#0f1d2e", lineHeight: 1 }}>{item.value}</div>
                <div style={{ marginTop: "7px", color: "#667085", fontSize: "12px", fontWeight: 800 }}>{item.note}</div>
              </div>
            ))}
          </aside>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: "16px" }}>
          <div style={{ ...cardStyle, borderRadius: "22px", padding: "20px" }}>
            <div style={{ fontSize: "10px", fontWeight: 950, letterSpacing: "0.16em", color: "#6577c8", marginBottom: "10px" }}>CURRENT MISSION</div>
            <div style={{ fontSize: "20px", fontWeight: 950, color: "#071120", lineHeight: 1.45 }}>{digest.mission || fallbackDigest.mission}</div>
          </div>
          <div style={{ ...cardStyle, borderRadius: "22px", padding: "20px" }}>
            <div style={{ fontSize: "10px", fontWeight: 950, letterSpacing: "0.16em", color: "#6577c8", marginBottom: "10px" }}>VARIABLE FORMAT</div>
            <div style={{ fontSize: "20px", fontWeight: 950, color: "#071120", lineHeight: 1.45 }}>{digest.fixedFormat || fallbackDigest.fixedFormat}</div>
          </div>
          <div style={{ ...cardStyle, borderRadius: "22px", padding: "20px" }}>
            <div style={{ fontSize: "10px", fontWeight: 950, letterSpacing: "0.16em", color: "#6577c8", marginBottom: "10px" }}>TARGET KPI</div>
            <div style={{ fontSize: "15px", color: "#344358", lineHeight: 1.8, fontWeight: 850 }}>
              いずれか {digest.targetHitRateAny || "25〜32%でもOK"} / 3連単 {digest.targetHitRate3tan || "22〜28%でもOK"} / 回収率 {digest.targetRecoveryRate || "80%以上"} / 5,000円以上的中率を重視
            </div>
          </div>
        </section>

        <section style={{ ...cardStyle, borderRadius: "28px", padding: isMobile ? "22px" : "28px" }}>
          <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "18px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 950, letterSpacing: "0.16em", color: "#6577c8", marginBottom: "8px" }}>VARIABLE TICKET PLAYBOOK</div>
              <h2 style={{ margin: 0, fontSize: isMobile ? "24px" : "32px", lineHeight: 1.18, color: "#071120" }}>14点・18点・20点の役割分担</h2>
            </div>
            <span style={{ borderRadius: "9999px", padding: "9px 12px", border: "1px solid #d7e7f8", background: "#f4fbff", color: "#285e91", fontSize: "11px", fontWeight: 900 }}>標準: 3連単18点 / 2車単原則なし</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
            {playbookItems.map((item) => (
              <div key={item.title} style={{ borderRadius: "18px", border: "1px solid #dfeaf5", background: "#fbfdff", padding: "16px", minHeight: "144px" }}>
                <div style={{ fontSize: "12px", fontWeight: 950, color: "#172033", marginBottom: "10px" }}>{item.title}</div>
                <div style={{ fontSize: "13px", color: "#506177", lineHeight: 1.75 }}>{item.body}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)", gap: "18px" }}>
          <article style={{ ...cardStyle, borderRadius: "28px", padding: "24px" }}>
            <div style={{ fontSize: "10px", fontWeight: 950, letterSpacing: "0.16em", color: "#6577c8", marginBottom: "12px" }}>TICKET MODE MATRIX</div>
            <div style={{ display: "grid", gap: "10px" }}>
              {raceTypeItems.map((item) => (
                <div key={item.title} style={{ borderRadius: "16px", border: "1px solid #e2edf5", background: "#fff", padding: "14px 15px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 950, color: "#0f1d2e", marginBottom: "6px" }}>{item.title}</div>
                  <div style={{ fontSize: "13px", lineHeight: 1.75, color: "#506177" }}>{item.body}</div>
                </div>
              ))}
            </div>
          </article>
          <article style={{ ...cardStyle, borderRadius: "28px", padding: "24px" }}>
            <div style={{ fontSize: "10px", fontWeight: 950, letterSpacing: "0.16em", color: "#6577c8", marginBottom: "12px" }}>GPT MATERIAL PREVIEW</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", borderRadius: "18px", border: "1px solid #e0eaf5", background: "#fbfdff", padding: "16px", color: "#344358", fontSize: "12px", lineHeight: 1.85, maxHeight: "420px", overflow: "auto" }}>{guidancePreview || "月次振り返りが未登録です。"}</pre>
          </article>
        </section>

        <section style={{ ...cardStyle, borderRadius: "28px", padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 950, letterSpacing: "0.16em", color: "#6577c8", marginBottom: "8px" }}>RAW REPORT</div>
              <h2 style={{ margin: 0, fontSize: "24px", color: "#071120" }}>月次レポート原文</h2>
            </div>
            <span style={{ color: "#69778b", fontSize: "12px", fontWeight: 850 }}>{selectedItem?.file ?? "未登録"}</span>
          </div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", borderRadius: "20px", border: "1px solid #dfeaf5", background: "#fbfdff", padding: "18px", color: "#344358", fontSize: "13px", lineHeight: 1.9, minHeight: "220px" }}>
            {status === "loading" ? "月次レポートを読み込んでいます。" : status === "ready" ? reportText : "月次レポートを取得できませんでした。"}
          </pre>
        </section>
      </main>
    </div>
  );
}
