// NON-PUBLIC policy prototype for future server use. Never authorizes a browser request.
// Three CALENDAR months, UTC, clamped to the final day of the target month.
export function expiryFromActivation(activation){
  const value=new Date(activation);
  if(Number.isNaN(value.getTime()))throw new Error('Invalid activation timestamp.');
  const target=new Date(value);target.setUTCDate(1);target.setUTCMonth(target.getUTCMonth()+3);
  const lastDay=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(value.getUTCDate(),lastDay));
  return target.toISOString();
}
export function renewalWindow({currentExpiry,approvedAt}){
  const approved=new Date(approvedAt),expiry=new Date(currentExpiry);
  if(Number.isNaN(approved.getTime())||Number.isNaN(expiry.getTime()))throw new Error('Invalid renewal timestamps.');
  const start=approved>expiry?approved:expiry;
  return {startsAt:start.toISOString(),expiresAt:expiryFromActivation(start)};
}
