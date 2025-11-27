import * as Client from "lockedin";
import { rpcUrl, networkPassphrase } from "./util";

const contractId = "CCUBYPV6KJWOXPXGKKTG4DUKUW576S2CN7ABHW6BEDAYJWQ4IHRGJP2Z";

export default new Client.Client({
  contractId,
  networkPassphrase,
  rpcUrl,
});

export * from "lockedin";
