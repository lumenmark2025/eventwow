import { handleCreatePublicEnquiry } from "../_lib/publicEnquiries.js";

export default async function handler(req, res) {
  return handleCreatePublicEnquiry(req, res);
}
