import { ClickHouseService } from "./clickhouse.service";

describe("ClickHouseService — query param substitution", () => {
  let service: ClickHouseService;

  beforeEach(() => {
    service = new ClickHouseService();
    // onModuleInit creates the axios client; inject a fake post
    (service as any).client = {
      post: jest.fn(),
      defaults: { params: {} },
    };
  });

  function resolvedSqlFor(sql: string, params: Record<string, string | number>): string {
    // Access private method via any cast
    // We test indirectly by stubbing client.post and capturing the body
    const client = (service as any).client;
    client.post.mockResolvedValueOnce({ data: "" });
    (service as any).query(sql, params);

    if (client.post.mock.calls.length === 0) return sql;
    return client.post.mock.calls[0][1] as string;
  }

  it("substitutes string params with single-quoted values", async () => {
    const client = (service as any).client;
    client.post.mockResolvedValue({ data: "" });

    await (service as any).query(
      "SELECT * FROM t WHERE id = {id:String}",
      { id: "abc123" }
    );

    const sql: string = client.post.mock.calls[0][1];
    expect(sql).toContain("'abc123'");
    expect(sql).not.toContain("{id:String}");
  });

  it("substitutes numeric params without quotes", async () => {
    const client = (service as any).client;
    client.post.mockResolvedValue({ data: "" });

    await (service as any).query(
      "SELECT * FROM t LIMIT {n:UInt32}",
      { n: 10 }
    );

    const sql: string = client.post.mock.calls[0][1];
    expect(sql).toContain("10");
    expect(sql).not.toContain("{n:UInt32}");
  });

  it("escapes single quotes in string params", async () => {
    const client = (service as any).client;
    client.post.mockResolvedValue({ data: "" });

    await (service as any).query(
      "SELECT * FROM t WHERE name = {name:String}",
      { name: "O'Brien" }
    );

    const sql: string = client.post.mock.calls[0][1];
    expect(sql).toContain("\\'");
    expect(sql).not.toContain("O'Brien'"); // raw unescaped quote
  });

  it("escapes backslashes before single quotes", async () => {
    const client = (service as any).client;
    client.post.mockResolvedValue({ data: "" });

    await (service as any).query(
      "SELECT {val:String}",
      { val: "path\\to'file" }
    );

    const sql: string = client.post.mock.calls[0][1];
    // backslash escaped to \\ and quote escaped to \' → \\' in the SQL string
    expect(sql).toContain("\\\\to\\'");
  });

  it("parses JSONEachRow response lines", async () => {
    const client = (service as any).client;
    client.post.mockResolvedValue({
      data: '{"a":1}\n{"a":2}\n{"a":3}\n',
    });

    const result = await (service as any).query("SELECT 1", {});

    expect(result).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it("returns empty array for empty response", async () => {
    const client = (service as any).client;
    client.post.mockResolvedValue({ data: "" });

    const result = await (service as any).query("SELECT 1", {});

    expect(result).toEqual([]);
  });

  it("throws InternalServerErrorException on HTTP error", async () => {
    const client = (service as any).client;
    client.post.mockRejectedValue({ response: { data: "DB error" }, message: "err" });

    await expect((service as any).query("BAD SQL", {})).rejects.toThrow(
      "ClickHouse query failed"
    );
  });
});
