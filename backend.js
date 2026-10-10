/** Fail-closed integration boundary. No mock sessions, orders, approvals or entitlements. */
export class BackendUnavailableError extends Error {
  constructor(operation){super(`${operation} requires the backend. No action was performed.`);this.name='BackendUnavailableError';this.code='BACKEND_UNAVAILABLE';}
}
const unavailable=operation=>async()=>{throw new BackendUnavailableError(operation);};
export const academyBackend=Object.freeze({
  register:unavailable('Registration'),
  login:unavailable('Login'),
  logout:unavailable('Session revocation'),
  getSession:unavailable('Persistent authenticated session'),
  getLaunchPolicy:unavailable('Launch access policy'),
  beginSocialLink:unavailable('Telegram account linking'),
  verifyFreeAccess:unavailable('Fresh Telegram eligibility verification'),
  startAttempt:unavailable('Authorized attempt creation'),
  getSubjectAccess:unavailable('Current subject access'),
  updateLaunchPolicy:unavailable('Admin launch settings'),
  updateSubjectOffer:unavailable('Admin subject price and validity'),
  updateTestAccess:unavailable('Admin free/premium and publication settings'),
  getAccount:unavailable('Student account'),
  listOrders:unavailable('Order history'),
  createOrder:unavailable('Order creation'),
  submitPaymentReference:unavailable('UTR submission'),
  listEntitlements:unavailable('Purchased test access'),
  startPaidAttempt:unavailable('Paid test delivery'),
  saveAnswer:unavailable('Answer storage'),
  submitAttempt:unavailable('Server scoring'),
  listSavedResults:unavailable('Saved results'),
  adminReviewPayment:unavailable('Payment approval'),
  adminSaveContent:unavailable('Content management'),
  adminSetPaymentDetails:unavailable('UPI configuration')
  ,adminImportHtml:unavailable('Private HTML import')
  ,adminVerifyImport:unavailable('Import verification')
  ,adminPublish:unavailable('Content publication')
  ,adminChangeAccess:unavailable('Subject entitlement changes')
  ,adminSetVisibility:unavailable('Site visibility')
  ,createSupportTicket:unavailable('Private support')
  ,askSahooAi:unavailable('Authorized AI support')
  ,submitReview:unavailable('Verified student review')
});
