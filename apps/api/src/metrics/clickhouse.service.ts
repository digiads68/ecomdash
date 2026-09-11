import { Injectable, OnModuleInit, InternalServerErrorException, Logger } from "@nestjs/common";
import axios, { AxiosInstance } from "axios";

@Injectable()
export class ClickHouseService implements OnModuleInit {
  private client: AxiosInstance;
  private readonly logger = new Logger(ClickHouseService.name);

  onModuleInit() {
    this.client = axios.create({
      baseURL: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
      params: {
        database: process.env.CLICKHOUSE_DB || "ecomdash",
        user: process.env.CLICKHOUSE_USER || "default",
        password: process.env.CLICKHOUSE_PASSWORD || "",
      },
    });
  }

  async query<T = any>(sql: string, params: Record<string, string | number> = {}): Promise<T[]> {
    // Replace named params {paramName: Type} with values
    let resolvedSql = sql;
    for (const [key, value] of Object.entries(params)) {
      const escaped =
        typeof value === "string"
          ? `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
          : String(value);
      resolvedSql = resolvedSql.replace(new RegExp(`\\{${key}:[^}]+\\}`, "g"), escaped);
    }

    try {
      const response = await this.client.post("/", resolvedSql, {
        params: { ...this.client.defaults.params, output_format_json_quote_64bit_integers: 0 },
        headers: { "Content-Type": "text/plain" },
        responseType: "text",
      });

      if (!response.data || (response.data as string).trim() === "") return [];

      const lines = (response.data as string).trim().split("\n").filter(Boolean);
      return lines.map((line) => JSON.parse(line)) as T[];
    } catch (err: any) {
      const detail = err.response?.data ?? err.message;
      this.logger.error(`ClickHouse query failed: ${String(detail).slice(0, 300)}`);
      throw new InternalServerErrorException("ClickHouse query failed");
    }
  }

  async insert(table: string, rows: Record<string, any>[]): Promise<void> {
    if (rows.length === 0) return;
    const jsonLines = rows.map((r) => JSON.stringify(r)).join("\n");
    try {
      await this.client.post(`/?query=INSERT+INTO+${table}+FORMAT+JSONEachRow`, jsonLines, {
        headers: { "Content-Type": "text/plain" },
      });
    } catch (err: any) {
      const detail = err.response?.data ?? err.message;
      this.logger.error(`ClickHouse insert failed: ${String(detail).slice(0, 300)}`);
      throw new InternalServerErrorException("ClickHouse insert failed");
    }
  }
}
