// api/invite/preview.js
import handler from "../invite.js";
export default handler;
// You can GET like:
// /api/invite/preview?plannerEmail=your@email.com&userEmail=bart@midwesternbuilt.com
// It returns JSON with inviteUrl WITHOUT attempting to send an email.
