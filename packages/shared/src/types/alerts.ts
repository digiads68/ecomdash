export type AlertMetric = "roas" | "gmv" | "ad_spend" | "order_count" | "ctr" | "cpa";
export type AlertOperator = "lt" | "gt" | "lte" | "gte" | "eq";
export type AlertLogic = "AND" | "OR";
export type AlertActionType = "email" | "telegram";

export interface AlertCondition {
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  window: string;
}

export interface AlertAction {
  type: AlertActionType;
  to?: string;
  chatId?: string;
}

export interface AlertRuleConfig {
  conditions: AlertCondition[];
  logic: AlertLogic;
  actions: AlertAction[];
}

export type AlertStateEnum = "FIRING" | "RESOLVED";

export interface AlertInstanceDto {
  id: string;
  ruleId: string;
  ruleName: string;
  shopId: string | null;
  state: AlertStateEnum;
  metadata: Record<string, unknown>;
  firedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
}

export interface CreateAlertRuleDto {
  name: string;
  shopId?: string;
  conditions: AlertCondition[];
  logic: AlertLogic;
  actions: AlertAction[];
  isActive?: boolean;
}

export interface UpdateAlertRuleDto extends Partial<CreateAlertRuleDto> {}
