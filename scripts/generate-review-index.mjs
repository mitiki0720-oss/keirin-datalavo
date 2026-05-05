import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const reviewsRoot = path.join(projectRoot, "public", "data", "reviews");
const outputPath = path.join(reviewsRoot, "index.json");
const dateDirectoryPattern = /^\d{4}-\d{2}-\d{2}$/;
const reviewFilePattern = /^(?<slug>[a-z0-9-]+)-(?<kind>prediction|result|summary)\.txt$/;

const venueMap = {
  aomori: "青森",
  hakodate: "函館",
  iwakitaira: "いわき平",
  yahiko: "弥彦",
  maebashi: "前橋",
  toride: "取手",
  utsunomiya: "宇都宮",
  omiya: "大宮",
  seibuen: "西武園",
  keiokaku: "京王閣",
  tachikawa: "立川",
  matsudo: "松戸",
  chiba: "千葉",
  kawasaki: "川崎",
  hiratsuka: "平塚",
  odawara: "小田原",
  ito: "伊東",
  shizuoka: "静岡",
  nagoya: "名古屋",
  gifu: "岐阜",
  ogaki: "大垣",
  toyohashi: "豊橋",
  toyama: "富山",
  matsusaka: "松阪",
  yokkaichi: "四日市",
  fukui: "福井",
  nara: "奈良",
  wakayama: "和歌山",
  kishiwada: "岸和田",
  tamano: "玉野",
  hiroshima: "広島",
  hofu: "防府",
  takamatsu: "高松",
  komatsushima: "小松島",
  kochi: "高知",
  matsuyama: "松山",
  kokura: "小倉",
  kurume: "久留米",
  takeo: "武雄",
  sasebo: "佐世保",
  beppu: "別府",
  kumamoto: "熊本",
};

function toReviewPath(date, fileName) {
  return `data/reviews/${date}/${fileName}`;
}

function buildItem(date, slug, files) {
  const venue = venueMap[slug] ?? slug;
  const item = {
    date,
    venue,
  };

  if (files.prediction) {
    item.predictionFile = toReviewPath(date, files.prediction);
  }
  if (files.result) {
    item.resultFile = toReviewPath(date, files.result);
  }
  if (files.summary) {
    item.summaryFile = toReviewPath(date, files.summary);
  }

  return item;
}

async function collectReviewItems() {
  const directoryEntries = await readdir(reviewsRoot, { withFileTypes: true });
  const dateDirectories = directoryEntries
    .filter((entry) => entry.isDirectory() && dateDirectoryPattern.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  const items = [];
  const countsByDate = new Map();
  const unknownSlugs = new Set();

  for (const date of dateDirectories) {
    const datePath = path.join(reviewsRoot, date);
    const fileEntries = await readdir(datePath, { withFileTypes: true });
    const filesBySlug = new Map();

    for (const entry of fileEntries) {
      if (!entry.isFile()) {
        continue;
      }

      const match = entry.name.match(reviewFilePattern);
      if (!match?.groups) {
        continue;
      }

      const { slug, kind } = match.groups;
      const files = filesBySlug.get(slug) ?? {};
      files[kind] = entry.name;
      filesBySlug.set(slug, files);
    }

    const dateItems = [...filesBySlug.entries()]
      .map(([slug, files]) => {
        if (!venueMap[slug]) {
          unknownSlugs.add(slug);
        }
        return buildItem(date, slug, files);
      })
      .sort((left, right) => left.venue.localeCompare(right.venue, "ja"));

    countsByDate.set(date, dateItems.length);
    items.push(...dateItems);
  }

  return {
    items,
    countsByDate,
    unknownSlugs: [...unknownSlugs].sort((left, right) => left.localeCompare(right)),
  };
}

async function main() {
  const { items, countsByDate, unknownSlugs } = await collectReviewItems();
  const output = {
    version: 1,
    items,
  };

  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  for (const slug of unknownSlugs) {
    console.warn(`Unknown review slug: ${slug}`);
  }

  console.log(`Generated ${path.relative(projectRoot, outputPath)} with ${items.length} items.`);
  console.log("Items by date:");
  for (const [date, count] of countsByDate) {
    console.log(`- ${date}: ${count}`);
  }

  if (unknownSlugs.length > 0) {
    console.log("Unknown slugs:");
    for (const slug of unknownSlugs) {
      console.log(`- ${slug}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});