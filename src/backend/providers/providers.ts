import {
  buildProviders,
  makeStandardFetcher,
  targets,
} from "@nexus/providers";

import { isExtensionActiveCached } from "@/backend/extension/messaging";
import { makeExtensionFetcher } from "@/backend/providers/fetchers";
import { nexusCustomProviders, nexusCustomEmbeds } from "@/providers/nexus-providers-index";

function isDesktopApp(): boolean {
  return Boolean(typeof window !== "undefined" && window.__NEXUS_DESKTOP__);
}

export function getProviders() {
  const builder = buildProviders();

  // Desktop app has extension built in and can play MKV; use NATIVE target.
  if (isDesktopApp()) {
    builder
      .setFetcher(makeStandardFetcher(fetch))
      .setProxiedFetcher(makeExtensionFetcher())
      .setTarget(targets.NATIVE)
      .enableConsistentIpForRequests();
  } else if (isExtensionActiveCached()) {
    builder
      .setFetcher(makeStandardFetcher(fetch))
      .setProxiedFetcher(makeExtensionFetcher())
      .setTarget(targets.BROWSER_EXTENSION)
      .enableConsistentIpForRequests();
  } else {
    // The new HF provider returns browser-ready URLs. Keep the normal fetcher
    // available to provider code, but do not install a destination proxy.
    builder
      .setFetcher(makeStandardFetcher(fetch))
      .setProxiedFetcher(makeStandardFetcher(fetch))
      .setTarget(targets.BROWSER)
      .enableConsistentIpForRequests();
  }


  // Add NEXUS custom providers & embeds
  for (const provider of nexusCustomProviders) {
    builder.addSource(provider as any);
  }
  for (const embed of nexusCustomEmbeds) {
    builder.addEmbed(embed as any);
  }

  return builder.build();
}

export function getAllProviders() {
  const builder = buildProviders()
    .setFetcher(makeStandardFetcher(fetch))
    .setProxiedFetcher(makeStandardFetcher(fetch))
    .setTarget(targets.BROWSER)
    .enableConsistentIpForRequests();

  // Add NEXUS custom providers & embeds
  for (const provider of nexusCustomProviders) {
    builder.addSource(provider as any);
  }
  for (const embed of nexusCustomEmbeds) {
    builder.addEmbed(embed as any);
  }

  return builder.build();
}

