import { travelImages } from "./travelImages.js";

import { regionContent, destinationContent, packageContent, indiaContent } from "../../../shared/travelCatalog.js";

function withImages(item) {
  // Label inspiration photos with their real location when source photos are missing.
  const inspiration = {
    goa: ["andaman", "Coastal inspiration · Andaman Islands"],
    maharashtra: ["jaipur", "Heritage inspiration · Jaipur, Rajasthan"],
    gujarat: ["rajasthan", "Architecture inspiration · Rajasthan"],
  }[item.slug];
  const gallery = travelImages[item.mediaKey || item.slug] || travelImages[inspiration?.[0]] || [];
  return { ...item, ...gallery[0], image: gallery[0]?.src, gallery, imageCaption: inspiration?.[1] || item.country || item.title };
}

export const destinations = destinationContent.map((item) => ({ ...withImages(item), promotionId: `destination:${item.slug}` }));
export const tourPackages = packageContent.map((item) => ({ ...withImages(item), promotionId: `package:${item.slug}` }));
export const indiaJourneys = indiaContent.map((item) => ({ ...withImages(item), promotionId: `india:${item.slug}` }));
const regionImages = { "north-india": "rajasthan", "south-india": "kerala", "east-india": "sikkim", "west-india": "andaman", "central-india": "madhya-pradesh" };
export const regions = regionContent.map((region) => ({ ...region, promotionId: `region:${region.slug}`, ...travelImages[regionImages[region.slug]][0], image: travelImages[regionImages[region.slug]][0].src, imageCaption: region.slug === "west-india" ? "Coastal inspiration · Andaman Islands" : region.title }));

export const destinationPath = (item) => `/destinations-in-india/${item.slug}`;
export const regionPath = (item) => `/destinations-in-india/regions/${item.slug}`;
export const packagePath = (item) => `/tour-packages/${item.slug}`;
export const indiaPath = (item) => `/india/${item.slug}`;
export const travelPageTitles = Object.fromEntries([
  ["/tour-packages", "Tour packages"],
  ["/destinations-in-india", "Destinations in India"],
  ["/india", "India & beyond"],
  ...tourPackages.map((item) => [packagePath(item), item.title]),
  ...regions.map((item) => [regionPath(item), item.title]),
  ...destinations.map((item) => [destinationPath(item), item.title]),
  ...indiaJourneys.map((item) => [indiaPath(item), item.title]),
]);
