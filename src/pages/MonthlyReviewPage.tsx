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
  targetHitRateAny: "未達目標 65〜70%",
  targetHitRate3tan: "未設定",
  targetHitRate2tan: "未取得",
  targetRecoveryRate: "事前オッズと購入採算を確認",
  targetThirdOnlyMiss: "9月の3着だけ抜け 502R",
  fixedFormat: "A 8〜10点 / B 10〜14点 / C 0点 / 影18候補 / 1点100円",
  mission: "A選別を厳格化し、主要1・2着からの3着接続を点検する",
  rawText: "",
};
const metricCards = (digest: MonthlyReviewDigest) => [
  { label: "A / HIT TARGET", value: digest.targetHitRateAny || "未達目標 65〜70%", note: "達成実績ではない" },
  { label: "ALL PURCHASE", value: digest.targetHitRate3tan || "未設定", note: "目標値。購入的中実績とは別" },
  { label: "THIRD CONNECTION", value: digest.targetThirdOnlyMiss || "9月 502R", note: "9月の3着だけ抜け" },
  { label: "SHADOW VALUE", value: "最大1〜2点", note: "3条件以上を満たす候補だけ入れ替え昇格" },
];

const playbookItems = [
  { title: "A / HIT 8〜10", body: "2〜3分戦だけでAと決めない。頭2人以内、主筋1・2着、3着接続、追走不安と事前採算を確認する。" },
  { title: "B / VALUE 10〜12", body: "別の主導権シナリオと3着への接続を説明できる券を優先。14点は独立した強い根拠がある場合のみ。" },
  { title: "C / SKIP 0", body: "購入せず、可能な範囲で18候補の影を残す。影の仮想払戻は購入会計に入れない。" },
  { title: "SHADOW_18", body: "18候補を生成し、購入外を影として保存・監査する。18候補と18点購入を混同せず、投資額に含めない。" },
  { title: "SHADOW VALUE", body: "VALUE-1〜5のうち3条件以上でも購入確定ではない。最大1〜2点を入れ替え、総点数を増やさない。" },
];

const raceTypeItems = [
  { title: "A / HIT", body: "頭2人以内、主要1・2着枝、3着候補、追走不安、事前オッズと採算を確認。8〜10点。65〜70%は未達目標。" },
  { title: "B / VALUE", body: "10〜12点を中心に、異なる展開と別線・単騎3着を説明できる場合のみ14点まで。" },
  { title: "C / SKIP", body: "頭候補5人以上、並び不明、重大な不確定要素、LOW SAMPLE依存、展開が散るレース。購入0点、可能なら18候補は影として保存。" },
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
  const isOctoberReview = selectedItem?.month === "2026-10";
  const octoberMetrics = [
    { label: "SEPTEMBER BUY HIT", value: "816 / 2,006R", note: "40.68% / 照合採用2,075R" },
    { label: "SEPTEMBER ROI", value: "69.27%", note: "投資2,077,900円 / 払戻1,439,260円" },
    { label: "THIRD ONLY MISS", value: "502R", note: "9月購入不的中の42.18%" },
    { label: "SHADOW ONLY", value: "195R", note: "万車25R / 購入回収には含めない" },
  ];

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
              <span style={{ borderRadius: "9999px", padding: "9px 13px", background: "#f4f1ff", color: "#6b57a8", border: "1px solid #ddd3f0", fontSize: "11px", fontWeight: 900 }}>現在の運用: 10月 v2026-10</span>
              <span style={{ borderRadius: "9999px", padding: "9px 13px", background: "#eef6ff", color: "#285e91", border: "1px solid #cfe3fb", fontSize: "11px", fontWeight: 900 }}>8〜14点可変購入</span>
              <span style={{ borderRadius: "9999px", padding: "9px 13px", background: "#fff7ed", color: "#9a4f12", border: "1px solid #fed7aa", fontSize: "11px", fontWeight: 900 }}>A/B/Cレース選別</span>
              <span style={{ borderRadius: "9999px", padding: "9px 13px", background: "#fdf4ff", color: "#8a3d8f", border: "1px solid #f0cbed", fontSize: "11px", fontWeight: 900 }}>影VALUE昇格</span>
              <span style={{ borderRadius: "9999px", padding: "9px 13px", background: "#f0fdf4", color: "#167047", border: "1px solid #bbf7d0", fontSize: "11px", fontWeight: 900 }}>1点100円固定</span>
              <span style={{ borderRadius: "9999px", padding: "9px 13px", background: "#fff7ed", color: "#9a4f12", border: "1px solid #fed7aa", fontSize: "11px", fontWeight: 900 }}>18候補は影買い目</span>
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
            {(isOctoberReview && status === "ready" ? octoberMetrics : metricCards(digest)).map((item) => (
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
              {isOctoberReview
                ? "A/HIT 65〜70%は未達目標。9月実績48.14%。10月1〜11日は中間速報、10月12日は暫定です。"
                : "過去の監査レポートです。上の10月運用ルールと当時の実績を分けて確認してください。"}
            </div>
          </div>
        </section>

        <section style={{ ...cardStyle, borderRadius: "28px", padding: isMobile ? "22px" : "28px" }}>
          <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "18px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 950, letterSpacing: "0.16em", color: "#6577c8", marginBottom: "8px" }}>VARIABLE TICKET PLAYBOOK</div>
              <h2 style={{ margin: 0, fontSize: isMobile ? "24px" : "32px", lineHeight: 1.18, color: "#071120" }}>8〜14点購入と18候補影運用</h2>
            </div>
            <span style={{ borderRadius: "9999px", padding: "9px 12px", border: "1px solid #d7e7f8", background: "#f4fbff", color: "#285e91", fontSize: "11px", fontWeight: 900 }}>標準: 3連単8点 / 18候補は影買い目</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px" }}>
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
          {isOctoberReview ? <p style={{ margin: "0 0 12px", color: "#667085", fontSize: "12px" }}>以下は監査原文です。原文中の「提案・未実装」は資料作成時点の記述です。</p> : null}
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", borderRadius: "20px", border: "1px solid #dfeaf5", background: "#fbfdff", padding: "18px", color: "#344358", fontSize: "13px", lineHeight: 1.9, minHeight: "220px" }}>
            {status === "loading" ? "月次レポートを読み込んでいます。" : status === "ready" ? reportText : "月次レポートを取得できませんでした。"}
          </pre>
        </section>
      </main>
    </div>
  );
}
