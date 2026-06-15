import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  ChevronLeft,
  Globe2,
  ImageIcon,
  Loader2,
  LogOut,
  Palette,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { SkillsCatalogSettings } from "@/components/settings/SkillsCatalogSettings";
import { cn } from "@/lib/utils";
import { useClient } from "@/providers/ClientProvider";
import {
  createModelConfiguration,
  fetchMcpPresets,
  fetchSettings,
  fetchSettingsUsage,
  importMcpConfig,
  loginProviderOAuth,
  logoutProviderOAuth,
  runMcpPresetAction,
  saveCustomMcpServer,
  updateImageGenerationSettings,
  updateMcpServerTools,
  updateModelConfiguration,
  updateNetworkSafetySettings,
  updateProviderSettings,
  updateSettings,
  updateWebSearchSettings,
} from "@/lib/api";
import { notifyMcpPresetsChanged } from "@/lib/mcp-preset-events";
import type {
  ImageGenerationSettingsUpdate,
  McpPresetsPayload,
  NetworkSafetySettingsUpdate,
  SettingsPayload,
  SkillSummary,
  WebSearchSettingsUpdate,
} from "@/lib/types";
import { SettingsGroup, SettingsRow } from "./settings-ui";
import {
  defaultPreset,
  editableDefaultProvider,
  modelPresetValue,
  normalizeContextWindowTokens,
  ProviderForm,
  visibleWebuiDefaultAccessMode,
} from "./provider-settings";
import { OverviewSection } from "./OverviewSection";
import { AppearanceSection } from "./AppearanceSection";
import { ModelsSettings, NewModelConfigurationDialog, type AgentSettingsDraft, type ModelConfigurationDraft } from "./ModelsSection";
import { ProvidersSettings } from "./ProvidersSection";
import { ImageSection } from "./ImageSection";
import { BrowserSection } from "./BrowserSection";
import { AppsSection, type CustomMcpForm, DEFAULT_CUSTOM_MCP_FORM } from "./AppsSection";
import { RuntimeSection } from "./RuntimeSection";
import { AdvancedSection } from "./AdvancedSection";

// ---- Types & Constants ----

export type SettingsSectionKey =
  | "overview" | "appearance" | "models" | "image"
  | "browser" | "apps" | "skills" | "runtime" | "advanced";

type LocalDensity = "comfortable" | "compact";
type LocalActivityMode = "auto" | "expanded";

interface LocalPreferences {
  density: LocalDensity;
  activityMode: LocalActivityMode;
  codeWrap: boolean;
  brandLogos: boolean;
}

type PendingRestartSection = "runtime" | "browser" | "image";
type PendingRestartSections = Record<PendingRestartSection, boolean>;
type RestartAwarePayload = {
  requires_restart?: boolean;
  surface?: SettingsPayload["surface"];
  runtime_surface?: SettingsPayload["runtime_surface"];
  runtime_capabilities?: SettingsPayload["runtime_capabilities"];
};

const LOCAL_PREFS_STORAGE_KEY = "nanobot-webui.settings-preferences";

const DEFAULT_LOCAL_PREFS: LocalPreferences = {
  density: "comfortable",
  activityMode: "auto",
  codeWrap: true,
  brandLogos: true,
};

const EMPTY_PENDING_RESTART_SECTIONS: PendingRestartSections = {
  runtime: false, browser: false, image: false,
};

const DEFAULT_WEB_SEARCH_FORM: WebSearchSettingsUpdate = {
  provider: "", apiKey: "", baseUrl: "", maxResults: 5, timeout: 20, useJinaReader: true,
};

const DEFAULT_IMAGE_GENERATION_FORM: ImageGenerationSettingsUpdate = {
  enabled: true, provider: "", model: "",
  defaultAspectRatio: "1:1", defaultImageSize: "1K", maxImagesPerTurn: 4,
};

const DEFAULT_NETWORK_SAFETY_FORM: NetworkSafetySettingsUpdate = {
  webuiAllowLocalServiceAccess: true, webuiDefaultAccessMode: "default",
};

const DEFAULT_AGENT_SETTINGS_DRAFT: AgentSettingsDraft = {
  model: "", provider: "", modelPreset: "default", presetLabel: "default",
  contextWindowTokens: 65_536, timezone: "", botName: "", botIcon: "", toolHintMaxLength: 0,
};

const SETTINGS_NAV_ITEMS: Array<{ key: SettingsSectionKey; icon: typeof Activity; fallback: string }> = [
  { key: "overview", icon: Activity, fallback: "Overview" },
  { key: "appearance", icon: Palette, fallback: "Appearance" },
  { key: "models", icon: SlidersHorizontal, fallback: "Models" },
  { key: "image", icon: ImageIcon, fallback: "Image" },
  { key: "browser", icon: Globe2, fallback: "Web" },
  { key: "apps", icon: Sparkles, fallback: "Apps" },
  { key: "skills", icon: Bot, fallback: "Skills" },
  { key: "runtime", icon: Server, fallback: "System" },
  { key: "advanced", icon: ShieldCheck, fallback: "Security" },
];

function titleForSection(section: SettingsSectionKey): string {
  return SETTINGS_NAV_ITEMS.find((i) => i.key === section)?.fallback ?? "Settings";
}

function readLocalPreferences(): LocalPreferences {
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_LOCAL_PREFS;
    const parsed = JSON.parse(raw) as Partial<LocalPreferences>;
    return {
      density: parsed.density === "compact" ? "compact" : "comfortable",
      activityMode: parsed.activityMode === "expanded" ? "expanded" : "auto",
      codeWrap: parsed.codeWrap !== false,
      brandLogos: parsed.brandLogos !== false,
    };
  } catch {
    return DEFAULT_LOCAL_PREFS;
  }
}

function agentDraftFromPayload(payload: SettingsPayload): AgentSettingsDraft {
  const fb = defaultPreset(payload);
  const activeName = modelPresetValue(payload);
  const active = payload.model_presets.find((p) => p.name === activeName) ?? fb;
  return {
    model: active?.model ?? payload.agent.model,
    provider: active?.is_default ? editableDefaultProvider(payload) : active?.provider ?? editableDefaultProvider(payload),
    modelPreset: activeName,
    presetLabel: active?.label ?? activeName,
    contextWindowTokens: normalizeContextWindowTokens(active?.context_window_tokens ?? payload.agent.context_window_tokens),
    timezone: payload.agent.timezone,
    botName: payload.agent.bot_name,
    botIcon: payload.agent.bot_icon,
    toolHintMaxLength: payload.agent.tool_hint_max_length,
  };
}

function webSearchFormFromPayload(payload: SettingsPayload, prev?: WebSearchSettingsUpdate): WebSearchSettingsUpdate {
  return {
    provider: payload.web_search.provider,
    apiKey: prev?.provider === payload.web_search.provider ? prev.apiKey ?? "" : "",
    baseUrl: payload.web_search.base_url ?? "",
    maxResults: payload.web_search.max_results,
    timeout: payload.web_search.timeout,
    useJinaReader: payload.web.fetch.use_jina_reader,
  };
}

function imageGenerationFormFromPayload(payload: SettingsPayload): ImageGenerationSettingsUpdate {
  return {
    enabled: payload.image_generation.enabled,
    provider: payload.image_generation.provider,
    model: payload.image_generation.model,
    defaultAspectRatio: payload.image_generation.default_aspect_ratio,
    defaultImageSize: payload.image_generation.default_image_size,
    maxImagesPerTurn: payload.image_generation.max_images_per_turn,
  };
}

function networkSafetyFormFromPayload(payload: SettingsPayload): NetworkSafetySettingsUpdate {
  return {
    webuiAllowLocalServiceAccess: payload.advanced.webui_allow_local_service_access ?? payload.advanced.allow_local_preview_access ?? true,
    webuiDefaultAccessMode: visibleWebuiDefaultAccessMode(payload.advanced.webui_default_access_mode),
  };
}

function pendingRestartSectionsFromPayload(payload: SettingsPayload): PendingRestartSections {
  const sections = payload.restart_required_sections ?? [];
  return {
    runtime: sections.includes("runtime"),
    browser: sections.includes("browser"),
    image: sections.includes("image"),
  };
}

// ---- Props ----

interface SettingsViewProps {
  theme: "light" | "dark";
  initialSection?: SettingsSectionKey;
  initialSettings?: SettingsPayload | null;
  showSidebar?: boolean;
  onToggleTheme: () => void;
  onBackToChat: () => void;
  onModelNameChange: (modelName: string | null) => void;
  onSettingsChange?: (payload: SettingsPayload) => void;
  skills?: SkillSummary[];
  onWorkspaceSettingsChange?: () => void | Promise<void>;
  onSectionChange?: (section: SettingsSectionKey) => void;
  onLogout?: () => void;
  onRestart?: () => void;
  onNativeEngineRestart?: () => Promise<string>;
  isRestarting?: boolean;
  hostChromeInset?: boolean;
}

// ---- Main Component ----

export function SettingsView({
  theme,
  initialSection = "overview",
  initialSettings = null,
  showSidebar = true,
  onToggleTheme,
  onBackToChat,
  onModelNameChange,
  onSettingsChange,
  skills = [],
  onWorkspaceSettingsChange,
  onSectionChange,
  onLogout,
  onRestart,
  onNativeEngineRestart,
  isRestarting = false,
  hostChromeInset = false,
}: SettingsViewProps) {
  const { t } = useTranslation();
  const { token } = useClient();
  const [settings, setSettings] = useState<SettingsPayload | null>(() => initialSettings);
  const [mcpPresets, setMcpPresets] = useState<McpPresetsPayload | null>(null);
  const [loading, setLoading] = useState(() => initialSettings === null);
  const [mcpPresetsLoading, setMcpPresetsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modelConfigurationOpen, setModelConfigurationOpen] = useState(false);
  const [modelConfigurationSaving, setModelConfigurationSaving] = useState(false);
  const [modelConfigurationForm, setModelConfigurationForm] = useState<ModelConfigurationDraft>({ label: "", provider: "", model: "" });
  const [mcpPresetAction, setMcpPresetAction] = useState<string | null>(null);
  const [providerSaving, setProviderSaving] = useState<string | null>(null);
  const [webSearchSaving, setWebSearchSaving] = useState(false);
  const [imageGenerationSaving, setImageGenerationSaving] = useState(false);
  const [networkSafetySaving, setNetworkSafetySaving] = useState(false);
  const [hostEngineApplying, setHostEngineApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>(initialSection);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [providerQuery, setProviderQuery] = useState("");
  const [appsQuery, setAppsQuery] = useState("");
  const [mcpMessage, setMcpMessage] = useState<string | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpFieldValues, setMcpFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [customMcpForm, setCustomMcpForm] = useState<CustomMcpForm>(DEFAULT_CUSTOM_MCP_FORM);
  const [mcpConfigImport, setMcpConfigImport] = useState("");
  const [providerForms, setProviderForms] = useState<Record<string, ProviderForm>>({});
  const [visibleProviderKeys, setVisibleProviderKeys] = useState<Record<string, boolean>>({});
  const [editingProviderKeys, setEditingProviderKeys] = useState<Record<string, boolean>>({});
  const [pendingRestartSections, setPendingRestartSections] = useState<PendingRestartSections>(EMPTY_PENDING_RESTART_SECTIONS);
  const [localPrefs, setLocalPrefs] = useState<LocalPreferences>(() => readLocalPreferences());
  const [webSearchForm, setWebSearchForm] = useState<WebSearchSettingsUpdate>(() =>
    initialSettings ? webSearchFormFromPayload(initialSettings) : DEFAULT_WEB_SEARCH_FORM);
  const [imageGenerationForm, setImageGenerationForm] = useState<ImageGenerationSettingsUpdate>(() =>
    initialSettings ? imageGenerationFormFromPayload(initialSettings) : DEFAULT_IMAGE_GENERATION_FORM);
  const [networkSafetyForm, setNetworkSafetyForm] = useState<NetworkSafetySettingsUpdate>(() =>
    initialSettings ? networkSafetyFormFromPayload(initialSettings) : DEFAULT_NETWORK_SAFETY_FORM);

  const [webSearchKeyVisible, setWebSearchKeyVisible] = useState(false);
  const [webSearchKeyEditing, setWebSearchKeyEditing] = useState(false);
  const [form, setForm] = useState<AgentSettingsDraft>(() =>
    initialSettings ? agentDraftFromPayload(initialSettings) : DEFAULT_AGENT_SETTINGS_DRAFT);

  useEffect(() => { setActiveSection(initialSection); }, [initialSection]);

  const selectSection = useCallback((section: SettingsSectionKey) => {
    setActiveSection(section);
    onSectionChange?.(section);
  }, [onSectionChange]);

  const text = useCallback((key: string, fallback: string, options?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...(options ?? {}) }), [t]);

  const applyPayload = useCallback((payload: SettingsPayload) => {
    setSettings(payload);
    setForm(agentDraftFromPayload(payload));
    setWebSearchForm((prev) => webSearchFormFromPayload(payload, prev));
    setImageGenerationForm(imageGenerationFormFromPayload(payload));
    setNetworkSafetyForm(networkSafetyFormFromPayload(payload));
    if (payload.restart_required_sections) {
      setPendingRestartSections(pendingRestartSectionsFromPayload(payload));
    }
    onSettingsChange?.(payload);
  }, [onSettingsChange]);

  useEffect(() => {
    if (!initialSettings || settings !== null) return;
    applyPayload(initialSettings);
    setLoading(false);
  }, [applyPayload, initialSettings, settings]);

  useEffect(() => {
    let cancelled = false;
    const showLoading = settings === null;
    if (showLoading) setLoading(true);
    fetchSettings(token)
      .then((payload) => { if (!cancelled) { applyPayload(payload); setError(null); } })
      .catch((err) => { if (!cancelled && showLoading) setError((err as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applyPayload, token]);

  const hasSettings = settings !== null;
  useEffect(() => {
    if (activeSection !== "overview" || !hasSettings) return;
    let cancelled = false;
    const refresh = () => {
      fetchSettingsUsage(token)
        .then((usage) => { if (!cancelled) setSettings((cur) => (cur ? { ...cur, usage } : cur)); })
        .catch(() => {});
    };
    void refresh();
    const interval = window.setInterval(refresh, 5000);
    const onFocus = () => refresh();
    const onVisibilityChange = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [activeSection, hasSettings, token]);

  useEffect(() => {
    if (activeSection !== "apps") return;
    let cancelled = false;
    setMcpPresetsLoading(true);
    fetchMcpPresets(token)
      .then((payload) => { if (!cancelled) { setMcpPresets(payload); setMcpError(null); } })
      .catch((err) => { if (!cancelled) setMcpError((err as Error).message); })
      .finally(() => { if (!cancelled) setMcpPresetsLoading(false); });
    return () => { cancelled = true; };
  }, [activeSection, token]);

  useEffect(() => {
    try { window.localStorage.setItem(LOCAL_PREFS_STORAGE_KEY, JSON.stringify(localPrefs)); }
    catch { /* ok */ }
  }, [localPrefs]);

  useEffect(() => {
    if (!settings) return;
    setProviderForms((prev) => {
      const next = { ...prev };
      for (const provider of settings.providers) {
        next[provider.name] = {
          apiKey: next[provider.name]?.apiKey ?? "",
          apiBase: next[provider.name]?.apiBase ?? provider.api_base ?? provider.default_api_base ?? "",
          apiType: next[provider.name]?.apiType ?? provider.api_type ?? "auto",
        };
      }
      return next;
    });
  }, [settings]);

  const modelDirty = useMemo(() => {
    if (!settings) return false;
    const activePresetName = modelPresetValue(settings);
    const selectedPreset = settings.model_presets.find((p) => p.name === form.modelPreset);
    if (!selectedPreset) return form.modelPreset !== activePresetName;
    const selectedProvider = selectedPreset.is_default ? editableDefaultProvider(settings) : selectedPreset.provider;
    return form.modelPreset !== activePresetName || form.model !== selectedPreset.model ||
      form.provider !== selectedProvider ||
      form.contextWindowTokens !== normalizeContextWindowTokens(selectedPreset.context_window_tokens) ||
      (!selectedPreset.is_default && form.presetLabel.trim() !== selectedPreset.label);
  }, [form, settings]);

  const runtimeDirty = useMemo(() => {
    if (!settings) return false;
    return form.timezone !== settings.agent.timezone || form.botName !== settings.agent.bot_name || form.botIcon !== settings.agent.bot_icon;
  }, [form, settings]);

  const imageGenerationDirty = useMemo(() => {
    if (!settings) return false;
    return imageGenerationForm.enabled !== settings.image_generation.enabled ||
      imageGenerationForm.provider !== settings.image_generation.provider ||
      imageGenerationForm.model !== settings.image_generation.model ||
      imageGenerationForm.defaultAspectRatio !== settings.image_generation.default_aspect_ratio ||
      imageGenerationForm.defaultImageSize !== settings.image_generation.default_image_size ||
      imageGenerationForm.maxImagesPerTurn !== settings.image_generation.max_images_per_turn;
  }, [imageGenerationForm, settings]);

  const networkSafetyDirty = useMemo(() => {
    if (!settings) return false;
    const currentLocalServiceAccess = settings.advanced.webui_allow_local_service_access ?? settings.advanced.allow_local_preview_access ?? true;
    const currentDefaultAccess = visibleWebuiDefaultAccessMode(settings.advanced.webui_default_access_mode);
    return networkSafetyForm.webuiAllowLocalServiceAccess !== currentLocalServiceAccess ||
      networkSafetyForm.webuiDefaultAccessMode !== currentDefaultAccess;
  }, [networkSafetyForm, settings]);

  const configuredModelProviderOptions = useMemo(
    () => settings?.providers.filter((p) => p.configured).map((p) => ({ name: p.name, label: p.label })) ?? [],
    [settings]);

  const hasPendingRestart = useMemo(
    () => !!settings?.requires_restart || pendingRestartSections.runtime || pendingRestartSections.browser || pendingRestartSections.image,
    [pendingRestartSections, settings?.requires_restart]);

  const restartViaSettingsSurface = useCallback(async () => {
    const isNativeHost = (settings?.surface ?? settings?.runtime_surface) === "native";
    if (isNativeHost && settings?.runtime_capabilities?.can_restart_engine && onNativeEngineRestart) {
      setHostEngineApplying(true);
      try {
        const nextToken = await onNativeEngineRestart();
        const payload = await fetchSettings(nextToken);
        applyPayload(payload);
        setPendingRestartSections(EMPTY_PENDING_RESTART_SECTIONS);
        setError(null);
      } catch (err) { setError((err as Error).message); }
      finally { setHostEngineApplying(false); }
      return;
    }
    onRestart?.();
  }, [applyPayload, onNativeEngineRestart, onRestart, settings]);

  const maybeRestartHostEngine = useCallback(async (payload: RestartAwarePayload) => {
    const surface = payload.surface ?? payload.runtime_surface ?? settings?.surface ?? settings?.runtime_surface;
    const cap = payload.runtime_capabilities ?? settings?.runtime_capabilities;
    if (!payload.requires_restart || surface !== "native" || !cap?.can_restart_engine || !onNativeEngineRestart) return;
    setHostEngineApplying(true);
    try {
      const nextToken = await onNativeEngineRestart();
      const refreshed = await fetchSettings(nextToken);
      applyPayload(refreshed);
      setPendingRestartSections(EMPTY_PENDING_RESTART_SECTIONS);
      setError(null);
    } catch (err) { setError((err as Error).message); }
    finally { setHostEngineApplying(false); }
  }, [applyPayload, onNativeEngineRestart, settings]);

  const saveModelSettings = async () => {
    if (!settings || !modelDirty || saving) return;
    setSaving(true);
    try {
      const selectedPreset = settings.model_presets.find((p) => p.name === form.modelPreset);
      let payload: SettingsPayload;
      if (selectedPreset && !selectedPreset.is_default) {
        payload = await updateModelConfiguration(token, {
          name: selectedPreset.name, label: form.presetLabel.trim(), model: form.model, provider: form.provider,
          ...(form.contextWindowTokens !== selectedPreset.context_window_tokens ? { contextWindowTokens: form.contextWindowTokens } : {}),
        });
      } else {
        const defaultModel = defaultPreset(settings)?.model ?? settings.agent.model;
        const defaultProvider = editableDefaultProvider(settings);
        const defaultCtx = normalizeContextWindowTokens(defaultPreset(settings)?.context_window_tokens ?? settings.agent.context_window_tokens);
        payload = await updateSettings(token, {
          modelPreset: form.modelPreset,
          ...(form.model !== defaultModel ? { model: form.model } : {}),
          ...(form.provider !== defaultProvider ? { provider: form.provider } : {}),
          ...(form.contextWindowTokens !== defaultCtx ? { contextWindowTokens: form.contextWindowTokens } : {}),
        });
      }
      applyPayload(payload);
      onModelNameChange(payload.agent.model || null);
      setError(null);
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  const openModelConfigurationDialog = () => {
    if (!settings) return;
    const provider = configuredModelProviderOptions.find((o) => o.name === settings.agent.provider)?.name ?? configuredModelProviderOptions[0]?.name ?? "";
    setModelConfigurationForm({ label: "", provider, model: "" });
    setModelConfigurationOpen(true);
  };

  const handleCreateModelConfiguration = async () => {
    if (modelConfigurationSaving) return;
    const label = modelConfigurationForm.label.trim();
    const provider = modelConfigurationForm.provider.trim();
    const model = modelConfigurationForm.model.trim();
    if (!label || !provider || !model) return;
    setModelConfigurationSaving(true);
    try {
      const payload = await createModelConfiguration(token, { label, provider, model });
      applyPayload(payload);
      onModelNameChange(payload.agent.model || null);
      setModelConfigurationOpen(false);
      setError(null);
    } catch (err) { setError((err as Error).message); }
    finally { setModelConfigurationSaving(false); }
  };

  const saveRuntimeSettings = async () => {
    if (!settings || !runtimeDirty || saving) return;
    setSaving(true);
    try {
      const payload = await updateSettings(token, { timezone: form.timezone, botName: form.botName, botIcon: form.botIcon });
      applyPayload(payload);
      if (payload.requires_restart) setPendingRestartSections((prev) => ({ ...prev, runtime: true }));
      await onWorkspaceSettingsChange?.();
      await maybeRestartHostEngine(payload);
      setError(null);
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  const saveImageGenerationSettings = async () => {
    if (!settings || !imageGenerationDirty || imageGenerationSaving) return;
    setImageGenerationSaving(true);
    try {
      const payload = await updateImageGenerationSettings(token, imageGenerationForm);
      applyPayload(payload);
      if (payload.requires_restart) setPendingRestartSections((prev) => ({ ...prev, image: true }));
      await maybeRestartHostEngine(payload);
      setError(null);
    } catch (err) { setError((err as Error).message); }
    finally { setImageGenerationSaving(false); }
  };

  const saveNetworkSafetySettings = async () => {
    if (!settings || !networkSafetyDirty || networkSafetySaving) return;
    setNetworkSafetySaving(true);
    try {
      const payload = await updateNetworkSafetySettings(token, networkSafetyForm);
      applyPayload(payload);
      if (payload.requires_restart) setPendingRestartSections((prev) => ({ ...prev, runtime: true }));
      await maybeRestartHostEngine(payload);
      setError(null);
    } catch (err) { setError((err as Error).message); }
    finally { setNetworkSafetySaving(false); }
  };

  const saveProvider = async (providerName: string) => {
    if (providerSaving) return;
    const provider = settings?.providers.find((p) => p.name === providerName);
    if (!provider || provider.auth_type === "oauth") return;
    const pf = providerForms[providerName] ?? { apiKey: "", apiBase: "", apiType: "auto" };
    const apiKey = pf.apiKey.trim();
    if (!provider.configured && (provider.api_key_required ?? true) && !apiKey) {
      setError(t("settings.byok.apiKeyRequired"));
      return;
    }
    setProviderSaving(providerName);
    try {
      const payload = await updateProviderSettings(token, { provider: providerName, apiKey: apiKey || undefined, apiBase: pf.apiBase.trim(), apiType: pf.apiType });
      applyPayload(payload);
      if (payload.requires_restart) setPendingRestartSections((prev) => ({ ...prev, image: true }));
      await maybeRestartHostEngine(payload);
      setProviderForms((prev) => ({ ...prev, [providerName]: { apiKey: "", apiBase: pf.apiBase.trim(), apiType: pf.apiType } }));
      setVisibleProviderKeys((prev) => ({ ...prev, [providerName]: false }));
      setEditingProviderKeys((prev) => ({ ...prev, [providerName]: false }));
      setError(null);
    } catch (err) { setError((err as Error).message); }
    finally { setProviderSaving(null); }
  };

  const runProviderOAuth = async (providerName: string, action: "login" | "logout") => {
    if (providerSaving) return;
    setProviderSaving(providerName);
    try {
      const payload = action === "login" ? await loginProviderOAuth(token, providerName) : await logoutProviderOAuth(token, providerName);
      applyPayload(payload);
      setExpandedProvider(providerName);
      setError(null);
    } catch (err) { setError((err as Error).message); }
    finally { setProviderSaving(null); }
  };

  const saveWebSearch = async () => {
    if (!settings || webSearchSaving) return;
    const provider = settings.web_search.providers.find((p) => p.name === webSearchForm.provider);
    if (!provider) return;
    const apiKey = webSearchForm.apiKey?.trim() ?? "";
    const baseUrl = webSearchForm.baseUrl?.trim() ?? "";
    const hasExisting = provider.credential === "api_key" && webSearchForm.provider === settings.web_search.provider && !!settings.web_search.api_key_hint;
    if (provider.credential === "api_key" && !apiKey && !hasExisting) { setError(t("settings.byok.webSearch.apiKeyRequired")); return; }
    if (provider.credential === "base_url" && !baseUrl) { setError(t("settings.byok.webSearch.baseUrlRequired")); return; }
    setWebSearchSaving(true);
    try {
      const webFetchRestartRequired = (webSearchForm.useJinaReader ?? settings.web.fetch.use_jina_reader) !== settings.web.fetch.use_jina_reader;
      const update: WebSearchSettingsUpdate = { provider: webSearchForm.provider, maxResults: webSearchForm.maxResults, timeout: webSearchForm.timeout, useJinaReader: webSearchForm.useJinaReader };
      if (provider.credential === "api_key" && apiKey) update.apiKey = apiKey;
      if (provider.credential === "base_url") update.baseUrl = baseUrl;
      const payload = await updateWebSearchSettings(token, update);
      applyPayload(payload);
      if (payload.requires_restart || webFetchRestartRequired) setPendingRestartSections((prev) => ({ ...prev, browser: true }));
      await maybeRestartHostEngine(payload);
      setWebSearchForm((prev) => ({ provider: payload.web_search.provider, apiKey: "", baseUrl: payload.web_search.base_url ?? prev.baseUrl ?? "", maxResults: payload.web_search.max_results, timeout: payload.web_search.timeout, useJinaReader: payload.web.fetch.use_jina_reader }));
      setWebSearchKeyVisible(false);
      setWebSearchKeyEditing(false);
      setError(null);
    } catch (err) { setError((err as Error).message); }
    finally { setWebSearchSaving(false); }
  };

  const resetProviderDraft = useCallback((providerName: string) => {
    const provider = settings?.providers.find((p) => p.name === providerName);
    if (!provider) return;
    setProviderForms((prev) => ({ ...prev, [providerName]: { apiKey: "", apiBase: provider.api_base ?? provider.default_api_base ?? "", apiType: provider.api_type ?? "auto" } }));
    setVisibleProviderKeys((prev) => ({ ...prev, [providerName]: false }));
    setEditingProviderKeys((prev) => ({ ...prev, [providerName]: false }));
  }, [settings]);

  const handleToggleProvider = useCallback((providerName: string) => {
    if (expandedProvider) resetProviderDraft(expandedProvider);
    setExpandedProvider(expandedProvider === providerName ? null : providerName);
  }, [expandedProvider, resetProviderDraft]);

  const resetWebSearchDraft = useCallback(() => {
    if (!settings) return;
    setWebSearchForm({ provider: settings.web_search.provider, apiKey: "", baseUrl: settings.web_search.base_url ?? "", maxResults: settings.web_search.max_results, timeout: settings.web_search.timeout, useJinaReader: settings.web.fetch.use_jina_reader });
    setWebSearchKeyVisible(false);
    setWebSearchKeyEditing(false);
  }, [settings]);

  const handleWebSearchProviderChange = useCallback((provider: string) => {
    if (!settings) return;
    setWebSearchForm((prev) => ({ provider, apiKey: "", baseUrl: provider === settings.web_search.provider ? settings.web_search.base_url ?? "" : "", maxResults: prev.maxResults ?? settings.web_search.max_results, timeout: prev.timeout ?? settings.web_search.timeout, useJinaReader: prev.useJinaReader ?? settings.web.fetch.use_jina_reader }));
    setWebSearchKeyVisible(false);
    setWebSearchKeyEditing(false);
  }, [settings]);

  const toggleProviderKeyVisibility = (providerName: string) => {
    setVisibleProviderKeys((prev) => ({ ...prev, [providerName]: !prev[providerName] }));
  };

  const toggleProviderKeyEditing = (providerName: string) => {
    setEditingProviderKeys((prev) => {
      const nextEditing = !prev[providerName];
      if (!nextEditing) {
        setProviderForms((forms) => ({ ...forms, [providerName]: { apiKey: "", apiBase: forms[providerName]?.apiBase ?? "", apiType: forms[providerName]?.apiType ?? "auto" } }));
        setVisibleProviderKeys((visible) => ({ ...visible, [providerName]: false }));
      }
      return { ...prev, [providerName]: nextEditing };
    });
  };

  const handleMcpPresetAction = async (action: "enable" | "remove" | "test", name: string, values: Record<string, string> = {}) => {
    setMcpPresetAction(`${action}:${name}`);
    setMcpMessage(null);
    setMcpError(null);
    try {
      const payload = await runMcpPresetAction(token, action, name, values);
      setMcpPresets(payload);
      setMcpMessage(payload.last_action?.message ?? null);
      if (action !== "test") notifyMcpPresetsChanged(payload);
      if (payload.requires_restart) setPendingRestartSections((prev) => ({ ...prev, runtime: true }));
      await maybeRestartHostEngine(payload);
      if (action === "enable") setMcpFieldValues((prev) => ({ ...prev, [name]: {} }));
    } catch (err) { setMcpError((err as Error).message); }
    finally { setMcpPresetAction(null); }
  };

  const handleSaveCustomMcp = async () => {
    const name = customMcpForm.name.trim();
    setMcpPresetAction(`custom:${name || "new"}`);
    setMcpMessage(null);
    setMcpError(null);
    try {
      const payload = await saveCustomMcpServer(token, { name, transport: customMcpForm.transport, command: customMcpForm.command, args: customMcpForm.args, url: customMcpForm.url, env: customMcpForm.env, headers: customMcpForm.headers, tool_timeout: customMcpForm.toolTimeout });
      setMcpPresets(payload);
      setMcpMessage(payload.last_action?.message ?? null);
      notifyMcpPresetsChanged(payload);
      if (payload.requires_restart) setPendingRestartSections((prev) => ({ ...prev, runtime: true }));
      await maybeRestartHostEngine(payload);
      setCustomMcpForm((prev: CustomMcpForm) => ({ ...DEFAULT_CUSTOM_MCP_FORM, transport: prev.transport }));
    } catch (err) { setMcpError((err as Error).message); }
    finally { setMcpPresetAction(null); }
  };

  const handleImportMcpConfig = async () => {
    setMcpPresetAction("import");
    setMcpMessage(null);
    setMcpError(null);
    try {
      const payload = await importMcpConfig(token, mcpConfigImport);
      setMcpPresets(payload);
      setMcpMessage(payload.last_action?.message ?? null);
      notifyMcpPresetsChanged(payload);
      if (payload.requires_restart) setPendingRestartSections((prev) => ({ ...prev, runtime: true }));
      await maybeRestartHostEngine(payload);
      setMcpConfigImport("");
    } catch (err) { setMcpError((err as Error).message); }
    finally { setMcpPresetAction(null); }
  };

  const handleMcpToolsChange = async (name: string, enabledTools: string[]) => {
    setMcpPresetAction(`tools:${name}`);
    setMcpMessage(null);
    setMcpError(null);
    try {
      const payload = await updateMcpServerTools(token, name, enabledTools);
      setMcpPresets(payload);
      setMcpMessage(payload.last_action?.message ?? null);
      notifyMcpPresetsChanged(payload);
      if (payload.requires_restart) setPendingRestartSections((prev) => ({ ...prev, runtime: true }));
      await maybeRestartHostEngine(payload);
    } catch (err) { setMcpError((err as Error).message); }
    finally { setMcpPresetAction(null); }
  };

  const renderSection = () => {
    if (!settings) return null;
    switch (activeSection) {
      case "overview":
        return (
          <OverviewSection
            settings={settings}
            requiresRestart={hasPendingRestart}
            showBrandLogos={localPrefs.brandLogos}
            onSelectSection={selectSection}
          />
        );
      case "appearance":
        return (
          <AppearanceSection
            theme={theme}
            onToggleTheme={onToggleTheme}
            localPrefs={localPrefs}
            onChangeLocalPrefs={setLocalPrefs}
          />
        );
      case "models":
        return (
          <div className="space-y-8">
            <ModelsSettings
              token={token}
              form={form}
              setForm={setForm}
              settings={settings}
              dirty={modelDirty}
              saving={saving}
              showBrandLogos={localPrefs.brandLogos}
              providerSaving={providerSaving}
              onProviderOAuthLogin={(provider: string) => runProviderOAuth(provider, "login")}
              onSave={saveModelSettings}
              onCreateConfiguration={openModelConfigurationDialog}
            />
            <ProvidersSettings
              settings={settings}
              expandedProvider={expandedProvider}
              providerForms={providerForms}
              visibleProviderKeys={visibleProviderKeys}
              editingProviderKeys={editingProviderKeys}
              providerSaving={providerSaving}
              query={providerQuery}
              showBrandLogos={localPrefs.brandLogos}
              onQueryChange={setProviderQuery}
              onToggleProvider={handleToggleProvider}
              onToggleProviderKey={toggleProviderKeyVisibility}
              onToggleProviderKeyEditing={toggleProviderKeyEditing}
              onChangeProviderForm={(provider: string, value: Partial<ProviderForm>) =>
                setProviderForms((prev) => ({ ...prev, [provider]: { apiKey: prev[provider]?.apiKey ?? "", apiBase: prev[provider]?.apiBase ?? "", apiType: prev[provider]?.apiType ?? "auto", ...value } }))
              }
              onSaveProvider={saveProvider}
              onProviderOAuthLogin={(provider: string) => runProviderOAuth(provider, "login")}
              onProviderOAuthLogout={(provider: string) => runProviderOAuth(provider, "logout")}
              onResetProviderDraft={resetProviderDraft}
              imageProviderRestartPending={pendingRestartSections.image}
              onRestart={restartViaSettingsSurface}
              isRestarting={isRestarting || hostEngineApplying}
            />
          </div>
        );
      case "image":
        return (
          <ImageSection
            settings={settings}
            form={imageGenerationForm}
            dirty={imageGenerationDirty}
            saving={imageGenerationSaving}
            onChangeForm={setImageGenerationForm}
            onSave={saveImageGenerationSettings}
            onOpenProviders={() => selectSection("models")}
            showBrandLogos={localPrefs.brandLogos}
            onRestart={restartViaSettingsSurface}
            isRestarting={isRestarting || hostEngineApplying}
            requiresRestartPending={pendingRestartSections.image}
          />
        );
      case "browser":
        return (
          <BrowserSection
            settings={settings}
            form={webSearchForm}
            keyVisible={webSearchKeyVisible}
            keyEditing={webSearchKeyEditing}
            saving={webSearchSaving}
            onChangeForm={setWebSearchForm}
            onChangeProvider={handleWebSearchProviderChange}
            onToggleKey={() => setWebSearchKeyVisible((v) => !v)}
            onToggleKeyEditing={() => { setWebSearchKeyEditing((e) => !e); setWebSearchKeyVisible(false); setWebSearchForm((prev) => ({ ...prev, apiKey: "" })); }}
            onReset={resetWebSearchDraft}
            onSave={saveWebSearch}
            showBrandLogos={localPrefs.brandLogos}
            onRestart={restartViaSettingsSurface}
            isRestarting={isRestarting || hostEngineApplying}
            requiresRestartPending={pendingRestartSections.browser}
          />
        );
      case "apps":
        return (
          <AppsSection
            mcpPresets={mcpPresets}
            mcpPresetsLoading={mcpPresetsLoading}
            query={appsQuery}
            mcpActionKey={mcpPresetAction}
            mcpMessage={mcpMessage}
            mcpError={mcpError}
            mcpFieldValues={mcpFieldValues}
            customMcpForm={customMcpForm}
            mcpConfigImport={mcpConfigImport}
            showBrandLogos={localPrefs.brandLogos}
            requiresRestartPending={pendingRestartSections.runtime}
            onQueryChange={setAppsQuery}
            onMcpAction={handleMcpPresetAction}
            onDismissStatus={() => { setMcpMessage(null); setMcpError(null); }}
            onMcpFieldChange={(presetName, fieldName, value) => {
              setMcpFieldValues((prev) => ({ ...prev, [presetName]: { ...(prev[presetName] ?? {}), [fieldName]: value } }));
            }}
            onCustomMcpFormChange={setCustomMcpForm}
            onMcpConfigImportChange={setMcpConfigImport}
            onSaveCustomMcp={handleSaveCustomMcp}
            onImportMcpConfig={handleImportMcpConfig}
            onMcpToolsChange={handleMcpToolsChange}
            onRestart={restartViaSettingsSurface}
            isRestarting={isRestarting || hostEngineApplying}
          />
        );
      case "skills":
        return <SkillsCatalogSettings skills={skills} />;
      case "runtime":
        return (
          <RuntimeSection
            form={form}
            setForm={setForm}
            settings={settings}
            dirty={runtimeDirty}
            saving={saving}
            onSave={saveRuntimeSettings}
            onRestart={restartViaSettingsSurface}
            isRestarting={isRestarting || hostEngineApplying}
            requiresRestartPending={pendingRestartSections.runtime}
          />
        );
      case "advanced":
        return (
          <AdvancedSection
            form={networkSafetyForm}
            dirty={networkSafetyDirty}
            saving={networkSafetySaving}
            settings={settings}
            requiresRestartPending={pendingRestartSections.runtime}
            onChangeForm={setNetworkSafetyForm}
            onSave={saveNetworkSafetySettings}
            onRestart={restartViaSettingsSurface}
            isRestarting={isRestarting || hostEngineApplying}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_0%,hsl(var(--muted))_0%,hsl(var(--background))_42%)] md:flex-row">
      {showSidebar ? (
        <SettingsSidebar
          activeSection={activeSection}
          onSelectSection={selectSection}
          onBackToChat={onBackToChat}
          onLogout={onLogout}
          hostChromeInset={hostChromeInset}
        />
      ) : null}

      <NewModelConfigurationDialog
        open={modelConfigurationOpen}
        draft={modelConfigurationForm}
        providers={configuredModelProviderOptions}
        saving={modelConfigurationSaving}
        showProviderLogos={localPrefs.brandLogos}
        onOpenChange={setModelConfigurationOpen}
        onChangeDraft={setModelConfigurationForm}
        onSave={handleCreateModelConfiguration}
      />

      <main className="min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className={cn("mx-auto w-full max-w-[920px] px-5 py-8 sm:px-8 lg:py-12", hostChromeInset && "pt-[4.25rem] sm:pt-[4.25rem] lg:pt-[4.75rem]")}>
          <div className="mb-7">
            {!showSidebar ? (
              <button type="button" onClick={onBackToChat} className="mb-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground lg:hidden">
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                {t("settings.backToChat")}
              </button>
            ) : null}
            <p className="mb-2 text-[12px] font-normal text-muted-foreground">{t("settings.sidebar.title")}</p>
            <h1 className="text-[24px] font-normal leading-tight tracking-normal text-foreground sm:text-[28px]">
              {text(`settings.nav.${activeSection}`, titleForSection(activeSection))}
            </h1>
          </div>

          {loading ? (
            <div className="flex h-48 items-center justify-center rounded-[24px] border border-border/50 bg-card/75 text-sm text-muted-foreground shadow-[0_20px_70px_rgba(15,23,42,0.07)]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("settings.status.loading")}
            </div>
          ) : error && !settings ? (
            <SettingsGroup>
              <SettingsRow title={t("settings.status.loadError")}>
                <span className="max-w-[520px] text-sm text-muted-foreground">{error}</span>
              </SettingsRow>
            </SettingsGroup>
          ) : settings ? (
            <div className="space-y-5">
              {error ? (
                <div className="rounded-[18px] border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error}</div>
              ) : null}
              {renderSection()}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}


// ---- SettingsSidebar ----

function SettingsSidebar({
  activeSection,
  onSelectSection,
  onBackToChat,
  onLogout,
  hostChromeInset,
}: {
  activeSection: SettingsSectionKey;
  onSelectSection: (section: SettingsSectionKey) => void;
  onBackToChat: () => void;
  onLogout?: () => void;
  hostChromeInset?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col border-b border-border/55 bg-card/62 px-4 pb-3 shadow-[inset_0_-1px_0_rgba(255,255,255,0.55)] backdrop-blur-xl dark:bg-card/45 dark:shadow-none md:w-[17rem] md:border-b-0 md:border-r md:pb-4 md:shadow-[inset_-1px_0_0_rgba(255,255,255,0.55)]",
        hostChromeInset ? "pt-[4.25rem] md:pt-[4.25rem]" : "pt-4 md:pt-4",
      )}
    >
      <button
        type="button"
        onClick={onBackToChat}
        className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground md:mb-3"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        {t("settings.backToChat")}
      </button>
      <div className="mb-3 px-1 md:mb-4 md:px-2">
        <h2 className="text-[18px] font-normal tracking-normal text-foreground">
          {t("settings.sidebar.title")}
        </h2>
      </div>

      <nav
        aria-label={t("settings.sidebar.ariaLabel")}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:block md:space-y-1 md:overflow-visible md:px-0 md:pb-0"
      >
        {SETTINGS_NAV_ITEMS.map(({ key, icon: Icon, fallback }) => {
          const isActive = activeSection === key;
          const label = t(`settings.nav.${key}`, { defaultValue: fallback });
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectSection(key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2.5 rounded-full px-3.5 py-2 text-[13px] font-medium leading-5 transition-all md:w-full md:rounded-[14px]",
                isActive
                  ? "bg-accent text-accent-foreground shadow-[0_1px_3px_rgba(0,0,0,0.07),0_0_0_1px_rgba(0,0,0,0.04)]"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4", isActive ? "text-foreground" : "text-muted-foreground")} aria-hidden />
              <span className="truncate">{label}</span>
            </button>
          );
        })}

        {onLogout ? (
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex shrink-0 items-center gap-2.5 rounded-full px-3.5 py-2 text-[13px] font-medium leading-5 text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground md:w-full md:rounded-[14px]"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="truncate">{t("app.account.logout")}</span>
          </button>
        ) : null}
      </nav>
    </aside>
  );
}
