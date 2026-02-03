// Type declarations for expo-foreground-actions

declare module 'expo-foreground-actions' {
  export interface AndroidSettings {
    notificationTitle?: string;
    notificationBody?: string;
    notificationChannelName?: string;
    notificationChannelID?: string;
    notificationProgress?: number;
    notificationMaxProgress?: number;
    notificationIndeterminate?: boolean;
    linkingURI?: string;
  }

  export function startForegroundAction(settings?: AndroidSettings): Promise<number>;
  export function stopForegroundAction(id?: number): Promise<void>;
  export function updateForegroundAction(settings: AndroidSettings): Promise<void>;
  export function forceStopAllForegroundActions(): Promise<void>;
}
