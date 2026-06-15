import { type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import type { NetworkSafetySettingsUpdate, SettingsPayload, WebuiDefaultAccessMode } from "@/lib/types";
import {
  RestartSettingsFooter,
  SegmentedControl,
  SettingsGroup,
  SettingsRow,
  SettingsSectionTitle,
  ToggleButton,
} from "./settings-ui";

// ---- AdvancedSettings ----

export function AdvancedSection({
  form,
  dirty,
  saving,
  settings,
  requiresRestartPending,
  onChangeForm,
  onSave,
  onRestart,
  isRestarting,
}: {
  form: NetworkSafetySettingsUpdate;
  dirty: boolean;
  saving: boolean;
  settings: SettingsPayload;
  requiresRestartPending: boolean;
  onChangeForm: Dispatch<SetStateAction<NetworkSafetySettingsUpdate>>;
  onSave: () => void;
  onRestart?: () => void;
  isRestarting?: boolean;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string) => t(key, { defaultValue: fallback });
  const isNativeHostSurface = (settings.surface ?? settings.runtime_surface) === "native";

  return (
    <div className="space-y-7">
      <section>
        <SettingsSectionTitle>
          {isNativeHostSurface
            ? tx("settings.sections.hostSafety", "App safety")
            : tx("settings.sections.webuiSafety", "Web safety")}
        </SettingsSectionTitle>
        <SettingsGroup>
          <SettingsRow
            title={tx("settings.rows.localServiceAccess", "Local Service Access")}
            description={tx(
              isNativeHostSurface ? "settings.help.localServiceAccessNative" : "settings.help.localServiceAccess",
              isNativeHostSurface
                ? "Allow Full Access shell commands to reach services on this Mac."
                : "Allow Full Access shell commands to reach localhost services.",
            )}
          >
            <ToggleButton
              checked={form.webuiAllowLocalServiceAccess}
              onChange={(webuiAllowLocalServiceAccess) =>
                onChangeForm((prev) => ({ ...prev, webuiAllowLocalServiceAccess }))
              }
              ariaLabel={tx("settings.rows.localServiceAccess", "Local Service Access")}
              label={form.webuiAllowLocalServiceAccess ? tx("settings.values.on", "On") : tx("settings.values.off", "Off")}
            />
          </SettingsRow>
          <SettingsRow
            title={tx("settings.rows.webuiDefaultAccess", "Default access")}
            description={tx(
              isNativeHostSurface ? "settings.help.webuiDefaultAccessNative" : "settings.help.webuiDefaultAccess",
              isNativeHostSurface
                ? "Used by native chats without a project-specific permission."
                : "Used by web chats without a project-specific permission.",
            )}
          >
            <SegmentedControl
              value={form.webuiDefaultAccessMode}
              options={[
                { value: "default", label: tx("settings.values.defaultPermission", "Default Permission") },
                { value: "full", label: tx("settings.values.fullAccess", "Full Access") },
              ]}
              onChange={(webuiDefaultAccessMode) =>
                onChangeForm((prev) => ({
                  ...prev,
                  webuiDefaultAccessMode: webuiDefaultAccessMode as WebuiDefaultAccessMode,
                }))
              }
            />
          </SettingsRow>
          <RestartSettingsFooter
            dirty={dirty}
            saving={saving}
            pendingRestart={requiresRestartPending}
            onSave={onSave}
            onRestart={onRestart}
            isRestarting={isRestarting}
          />
        </SettingsGroup>
      </section>

      <p className="max-w-3xl px-1 text-sm leading-6 text-muted-foreground">
        {tx(
          "settings.help.securityManagedControls",
          "Web fetches always protect local, private, and metadata services. Core channel safety stays in config.json.",
        )}
      </p>
    </div>
  );
}
