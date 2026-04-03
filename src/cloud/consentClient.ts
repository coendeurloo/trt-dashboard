export interface CloudConsentState {
  hasConsent: boolean;
  privacyPolicyAcceptedAt: string | null;
  healthDataConsentAt: string | null;
  privacyPolicyVersion: string | null;
}

export interface CloudConsentPayload {
  acceptPrivacyPolicy: true;
  acceptHealthDataConsent: true;
  privacyPolicyVersion: string;
  acceptedAt?: string;
}

const parseJson = async <T>(response: Response): Promise<T> => {
  let payload: unknown = null;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const errorPayload = payload as { error?: { message?: string } } | null;
    throw new Error(errorPayload?.error?.message || `HTTP_${response.status}`);
  }
  return payload as T;
};

export const fetchCloudConsent = async (): Promise<CloudConsentState> => {
  const response = await fetch("/api/cloud/consent", {
    method: "GET"
  });
  return parseJson<CloudConsentState>(response);
};

export const submitCloudConsent = async (
  payload: CloudConsentPayload
): Promise<CloudConsentState> => {
  const response = await fetch("/api/cloud/consent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = await parseJson<{ ok: boolean; consent: CloudConsentState }>(response);
  if (!body.ok || !body.consent) {
    throw new Error("Consent save failed");
  }
  return body.consent;
};
