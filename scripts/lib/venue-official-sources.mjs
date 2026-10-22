import { load } from "cheerio";
import { fetchWithRetry } from "./fetch-with-retry.mjs";

const sites = new Map([
  ["13", { name: "いわき平", pageUrl: "https://tairakeirin.com/shusohyo/", path: "/shusohyo/", inspect: inspectIwakiTaira }],
  ["22", { name: "前橋", pageUrl: "https://www.maebashi-keirin.jp/race/", path: "/race/", inspect: inspectMaebashi }],
]);

function safeSiteUrl(raw, base) {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "https:" || url.host !== new URL(base).host) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function inspectIwakiTaira(html, targetDate) {
  const $ = load(html);
  const compactDate = targetDate.replaceAll("-", "");
  const officialLinks = $('#area_0 a[href*="keirin.jp"], #area_1 a[href*="keirin.jp"], #area_2 a[href*="keirin.jp"]').toArray();
  for (const anchor of officialLinks) {
    const link = $(anchor).attr("href") ?? "";
    const url = new URL(link, "https://keirin.jp");
    if (url.hostname !== "keirin.jp" || url.searchParams.get("KCD") !== "13" || url.searchParams.get("KBI") !== compactDate || !url.pathname.endsWith("/racelist")) continue;
    const section = $(anchor).closest('[id^="area_"]');
    const pdfAnchor = section.find('a[href$=".pdf"]').toArray().find((element) => /出走表/.test($(element).text()));
    const pdfUrl = pdfAnchor ? safeSiteUrl($(pdfAnchor).attr("href"), "https://tairakeirin.com/shusohyo/") : "";
    return {
      status: "official-race-link-verified",
      officialEntryUrl: url.toString(),
      pdfUrl,
      pdfStatus: pdfUrl ? "content-unverified" : "not-published",
      adoptedFields: [],
    };
  }
  return { status: "date-or-venue-mismatch", officialEntryUrl: "", pdfUrl: "", pdfStatus: "unavailable", adoptedFields: [] };
}

export function inspectMaebashi(html) {
  const $ = load(html);
  const anchor = $('a[href$="runtable.pdf"]').toArray().find((element) => /出走表/.test($(element).text()));
  const pdfUrl = anchor ? safeSiteUrl($(anchor).attr("href"), "https://www.maebashi-keirin.jp/race/") : "";
  return {
    status: pdfUrl ? "pdf-date-unverified" : "pdf-unavailable",
    officialEntryUrl: "",
    pdfUrl,
    pdfStatus: pdfUrl ? "content-unverified" : "unavailable",
    adoptedFields: [],
  };
}

function robotsAllows(text, path) {
  let applies = false;
  for (const line of text.split(/\r?\n/)) {
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(":").split("#")[0].trim();
    if (key === "user-agent") applies = value === "*";
    if (applies && key === "disallow" && value && path.startsWith(value)) return false;
  }
  return true;
}

export async function probeVenueOfficialSite(venueCode, targetDate) {
  const site = sites.get(String(venueCode));
  if (!site) return null;
  try {
    const robotsUrl = new URL("/robots.txt", site.pageUrl);
    const robots = await fetchWithRetry(robotsUrl, { headers: { "user-agent": "KeirinDataLavo/1.0" } }, { attempts: 2, timeoutMs: 10_000, label: `${site.name} robots` });
    if (!robots.ok || !robotsAllows(await robots.text(), site.path)) return { status: "robots-unavailable-or-disallowed", pageUrl: site.pageUrl, adoptedFields: [] };
    const response = await fetchWithRetry(site.pageUrl, { headers: { "user-agent": "KeirinDataLavo/1.0" } }, { attempts: 2, timeoutMs: 15_000, label: `${site.name} official page` });
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) {
      return { status: `page-http-${response.status}`, pageUrl: site.pageUrl, adoptedFields: [] };
    }
    const evidence = site.inspect(await response.text(), targetDate);
    return { ...evidence, pageUrl: site.pageUrl, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { status: "fetch-unavailable", pageUrl: site.pageUrl, error: error instanceof Error ? error.message : String(error), adoptedFields: [] };
  }
}
