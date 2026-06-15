import { useTranslation } from "react-i18next";
import { Bot, ChevronRight, Globe2, HardDrive, ImageIcon, Server, type LucideIcon } from "lucide-react";
import { TokenUsageHeatmap } from "@/components/settings/TokenUsageHeatmap";
import { ProviderIcon } from "@/components/settings/provider-settings";
import { providerDisplayLabel } from "@/lib/provider-brand";
import type { SettingsPayload } from "@/lib/types";
import type { SettingsSectionKey } from "./SettingsView";
import { cn } from "@/lib/utils";
import { shortWorkspacePath } from "@/lib/workspace";
import { SettingsSectionTitle, SettingsGroup } from "./settings-ui";

function tOrFallback(t: (key: string, options?: Record<string, unknown>) => string, key: string, fallback: string) {
  return t(key, { defaultValue: fallback });
}

// ---- OverviewRowIcon ----

function OverviewRowIcon({
  icon: Icon,
  provider,
  showBrandLogos,
}: {
  icon: LucideIcon;
  provider?: string;
  showBrandLogos: boolean;
}) {
  if (provider && showBrandLogos) {
    return <ProviderIcon provider={provider} showBrandLogos={showBrandLogos} />;
  }
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-muted text-muted-foreground" aria-hidden>
      <Icon className="h-4 w-4" strokeWidth={2} />
    </span>
  );
}

// ---- OverviewValueLogo ----

function OverviewValueLogo({
  provider,
  showBrandLogos,
}: {
  provider: string;
  showBrandLogos: boolean;
}) {
  if (!showBrandLogos) return null;
  return <ProviderIcon provider={provider} showBrandLogos={showBrandLogos} />;
}

// ---- OverviewListRow ----

function OverviewListRow({
  icon,
  valueLogoProvider,
  title,
  value,
  caption,
  showBrandLogos = false,
  onClick,
}: {
  icon: LucideIcon;
  valueLogoProvider?: string;
  title: string;
  value: string;
  caption: string;
  showBrandLogos?: boolean;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-h-[62px] w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5",
        onClick && "transition-colors hover:bg-muted/35",
      )}
    >
      <OverviewRowIcon icon={icon} provider={valueLogoProvider} showBrandLogos={showBrandLogos} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium leading-5 text-foreground">{title}</div>
        <div className="mt-0.5 truncate text-[12px] leading-5 text-muted-foreground">{caption}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {valueLogoProvider ? (
          <OverviewValueLogo provider={valueLogoProvider} showBrandLogos={showBrandLogos} />
        ) : null}
        <span className="text-[13px] font-semibold text-foreground">{value}</span>
        {onClick ? <ChevronRight className="ml-1 h-4 w-4 text-muted-foreground" aria-hidden /> : null}
      </div>
    </Comp>
  );
}

// ---- OverviewSettings ----

export function OverviewSection({
  settings,
  requiresRestart,
  onSelectSection,
  showBrandLogos,
}: {
  settings: SettingsPayload;
  requiresRestart: boolean;
  onSelectSection: (section: SettingsSectionKey) => void;
  showBrandLogos: boolean;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string) => tOrFallback(t, key, fallback);
  const activePreset = settings.agent.model_preset || "default";
  const activeProvider = settings.agent.resolved_provider ?? settings.agent.provider;

  const settingsProviderConfigured = (payload: SettingsPayload, provider: string | null | undefined): boolean => {
    if (!provider) return false;
    const row = payload.providers.find((p) => p.name === provider);
    if (row) return row.configured;
    return payload.agent.has_api_key;
  };

  const activeProviderConfigured = settingsProviderConfigured(settings, activeProvider);
  const activeProviderLabel = providerDisplayLabel(settings.providers, activeProvider);
  const activeModelValue = activeProviderConfigured
    ? settings.agent.model
    : tx("settings.values.notConfigured", "Not configured");
  const activeModelCaption = activeProviderConfigured
    ? `${activeProvider} · ${activePreset}`
    : activeProviderLabel || settings.agent.model
      ? [activeProviderLabel, settings.agent.model].filter(Boolean).join(" · ")
      : tx("settings.byok.noConfiguredProviders", "No configured providers");
  const webStatus = settings.web.enable
    ? tx("settings.values.enabled", "Enabled")
    : tx("settings.values.disabled", "Disabled");
  const imageStatus = settings.image_generation.enabled
    ? tx("settings.values.enabled", "Enabled")
    : tx("settings.values.disabled", "Disabled");
  const imageCaption = `${providerDisplayLabel(settings.image_generation.providers, settings.image_generation.provider)} · ${
    settings.image_generation.provider_configured
      ? tx("settings.values.configured", "Configured")
      : tx("settings.values.notConfigured", "Not configured")
  }`;
  const isNativeHost = (settings.surface ?? settings.runtime_surface) === "native";
  const workspaceCaption = shortWorkspacePath(settings.runtime.workspace_path);
  const runtimeTitle = isNativeHost
    ? tx("settings.rows.engine", "Engine")
    : tx("settings.rows.gateway", "Gateway");
  const runtimeValue = isNativeHost
    ? tx("settings.values.privateEngine", "Private engine")
    : `${settings.runtime.gateway_host}:${settings.runtime.gateway_port}`;
  const runtimeCaption = isNativeHost
    ? tx("settings.values.unixSocket", "Unix socket")
    : requiresRestart
      ? tx("settings.values.restartPending", "Restart pending")
      : tx("settings.values.ready", "Ready");
  return (
    <div className="space-y-7">
      <section>
        <TokenUsageHeatmap usage={settings.usage} />
      </section>

      <section>
        <SettingsSectionTitle>{tx("settings.sections.ai", "AI")}</SettingsSectionTitle>
        <SettingsGroup>
          <OverviewListRow
            icon={Bot}
            valueLogoProvider={activeProvider}
            title={tx("settings.overview.model", "Current model")}
            value={activeModelValue}
            caption={activeModelCaption}
            showBrandLogos={showBrandLogos}
            onClick={() => onSelectSection("models")}
          />
        </SettingsGroup>
      </section>

      <section>
        <SettingsSectionTitle>{tx("settings.sections.capabilities", "Capabilities")}</SettingsSectionTitle>
        <SettingsGroup>
          <OverviewListRow
            icon={Globe2}
            valueLogoProvider={settings.web_search.provider}
            title={tx("settings.overview.webSearch", "Web search")}
            value={providerDisplayLabel(settings.web_search.providers, settings.web_search.provider)}
            caption={webStatus}
            showBrandLogos={showBrandLogos}
            onClick={() => onSelectSection("browser")}
          />
          <OverviewListRow
            icon={ImageIcon}
            valueLogoProvider={settings.image_generation.provider}
            title={tx("settings.overview.imageGeneration", "Image generation")}
            value={imageStatus}
            caption={imageCaption}
            showBrandLogos={showBrandLogos}
            onClick={() => onSelectSection("image")}
          />
        </SettingsGroup>
      </section>

      <section>
        <SettingsSectionTitle>{tx("settings.sections.system", "System")}</SettingsSectionTitle>
        <SettingsGroup>
          <OverviewListRow
            icon={Server}
            title={runtimeTitle}
            value={runtimeValue}
            caption={runtimeCaption}
            onClick={() => onSelectSection("runtime")}
          />
          <OverviewListRow
            icon={HardDrive}
            title={tx("settings.overview.workspace", "Workspace")}
            value={tx("settings.values.defaultWorkspace", "Default workspace")}
            caption={workspaceCaption}
            onClick={() => onSelectSection("runtime")}
          />
        </SettingsGroup>
      </section>
    </div>
  );
}
