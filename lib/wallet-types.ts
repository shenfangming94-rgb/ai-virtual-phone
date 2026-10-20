export type WalletCardStyle = "obsidian" | "graphite" | "silver";

export type WalletCard = {
  id: string;
  title: string;
  bankLabel: string;
  maskedNumber: string;
  cardStyle: WalletCardStyle;
  balance: number;
  note: string;
  accentLabel: string;
  isDefault?: boolean;
  /** 亲属卡（char 给她开的）：余额就是本月剩余额度，每月自动恢复；不算她的资产 */
  kin?: WalletKinInfo;
  createdAt: string;
  updatedAt: string;
};

export type WalletKinInfo = {
  charId: string;
  charName: string;
  monthlyLimit: number;
  /** 余额对应的月份 YYYY-MM，换月时恢复成满额度 */
  month: string;
  notify: boolean;
};

export type WalletAccountType = "balance" | "card";

export type WalletTransactionKind = "transfer_in" | "transfer_out" | "payment" | "refund" | "adjustment";

export type WalletTransaction = {
  id: string;
  cardId: string;
  accountType?: WalletAccountType;
  title: string;
  amount: number;
  kind: WalletTransactionKind;
  category: string;
  createdAt: string;
  detail: string;
  balanceAfter: number;
  relatedOrderId?: string;
};

export type WalletState = {
  balance: number;
  cards: WalletCard[];
  transactions: WalletTransaction[];
  defaultCardId: string;
  updatedAt: string;
};

export type WalletPaymentInput = {
  accountId?: string;
  cardId?: string;
  amount: number;
  title: string;
  detail: string;
  category?: string;
  relatedOrderId?: string;
};

export type WalletPaymentResult = {
  ok: boolean;
  state: WalletState;
  transaction?: WalletTransaction;
  error?: string;
};
