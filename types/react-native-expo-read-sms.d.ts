// Type declarations for @maniac-tech/react-native-expo-read-sms
declare module '@maniac-tech/react-native-expo-read-sms' {
  export function checkIfHasSMSPermission(): Promise<{
    hasReceiveSmsPermission: boolean;
    hasReadSmsPermission: boolean;
  }>;

  export function requestReadSMSPermission(): Promise<boolean>;

  export function startReadSMS(
    successCallback: (status: string, sms: string, error: string) => void,
    errorCallback: (status: string, sms: string, error: string) => void
  ): void;
}
