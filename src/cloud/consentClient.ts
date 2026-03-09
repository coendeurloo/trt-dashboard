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

const authHeaders = (accessToken: string): HeadersInit => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json"
});

export const fetchCloudConsent = async (
  accessToken: string
): Promise<CloudConsentState> => {
  const response = await fetch("/api/cloud/consent", {
    method: "GET",
    headers: authHeaders(accessToken)
  });
  return parseJson<CloudConsentState>(response);
};

export const submitCloudConsent = async (
  accessToken: string,
  payload: CloudConsentPayload
): Promise<CloudConsentState> => {
  const response = await fetch("/api/cloud/consent", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload)
  });
  const body = await parseJson<{ ok: boolean; consent: CloudConsentState }>(response);
  if (!body.ok || !body.consent) {
    throw new Error("Consent save failed");
  }
  return body.consent;
};
