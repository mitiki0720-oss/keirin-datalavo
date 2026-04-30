export default function MobileDashboardPage() {
  return (
    <main
      style={{
        width: "100%",
        maxWidth: "100vw",
        minHeight: "100vh",
        boxSizing: "border-box",
        overflowX: "hidden",
        background: "linear-gradient(180deg, #ffffff 0%, #fbf9fe 56%, #ffffff 100%)",
        padding: "20px 16px 80px",
      }}
    >
      <section
        style={{
          display: "grid",
          gap: "14px",
          borderRadius: "28px",
          padding: "22px 18px",
          background: "linear-gradient(180deg, #ffffff 0%, #faf7fd 100%)",
          border: "1px solid #ebe3f3",
          boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "11px",
            fontWeight: 900,
            letterSpacing: "0.2em",
            color: "#8c63c7",
          }}
        >
          MOBILE VIEW
        </p>

        <h1
          style={{
            margin: 0,
            fontSize: "28px",
            lineHeight: 1.24,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            color: "#081224",
          }}
        >
          携帯専用ページ
        </h1>

        <p
          style={{
            margin: 0,
            color: "#526072",
            fontSize: "14px",
            lineHeight: 1.9,
            fontWeight: 600,
          }}
        >
          ここに、今日の開催・予想・結果・的中状況をスマホで見やすくまとめていきます。
        </p>

        <a
          href="#dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "fit-content",
            borderRadius: "9999px",
            padding: "12px 16px",
            background: "#081224",
            color: "#ffffff",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 900,
            boxShadow: "0 12px 24px rgba(8, 18, 36, 0.14)",
          }}
        >
          PC版トップへ戻る
        </a>
      </section>
    </main>
  );
}