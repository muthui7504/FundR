import "dotenv/config";
import express from "express";
import {
  completeExpiredCampaigns,
  ensureDatabase,
  persistStore,
} from "./api-context";
import { compatibilityApi } from "./compat-server";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(
  express.json({
    limit: "16mb",
    verify: (request, _response, buffer) => {
      (request as typeof request & { rawBody?: Buffer }).rawBody =
        Buffer.from(buffer);
    },
  }),
);
app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.use("/api", compatibilityApi);
app.use(notFound);
app.use(errorHandler);

const campaignCompletionInterval = setInterval(() => {
  void ensureDatabase()
    .then(() => {
      if (completeExpiredCampaigns()) return persistStore();
    })
    .catch((cause: unknown) => {
      console.error("Unable to complete expired campaigns.", cause);
    });
}, 60_000);
campaignCompletionInterval.unref();

app.listen(port, () => {
  console.log(`FundR API listening on port ${port}`);
});
