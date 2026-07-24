import {
  buildProviders,
  makeStandardFetcher,
  targets,
} from "@nexus/providers";

import { isExtensionActiveCached } from "@/backend/extension/messaging";
import {
  makeExtensionFetcher,
  makeLoadBalancedSimpleProxyFetcher,
  setupM3U8Proxy,
} from "@/backend/providers/fetchers";
import { nexusCustomProviders, nexusCustomEmbeds } from "@/providers/nexus-providers-index";

// Initialize M3U8 proxy on module load
setupM3U8Proxy();

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
    setupM3U8Proxy();
    builder
      .setFetcher(makeStandardFetcher(fetch))
      .setProxiedFetcher(makeLoadBalancedSimpleProxyFetcher())
      .setTarget(targets.BROWSER_EXTENSION)
      .enableConsistentIpForRequests();
  }

  builder.addBuiltinProviders();

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
    .setTarget(targets.BROWSER_EXTENSION)
    .enableConsistentIpForRequests()
    .addBuiltinProviders();

  // Add NEXUS custom providers & embeds
  for (const provider of nexusCustomProviders) {
    builder.addSource(provider as any);
  }
  for (const embed of nexusCustomEmbeds) {
    builder.addEmbed(embed as any);
  }

  return builder.build();
}

