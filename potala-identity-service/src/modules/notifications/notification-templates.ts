export const notificationTemplates = {
  PASSWORD_RESET: [
    'Recuperar senha',
    'Use o link enviado por e-mail para definir uma nova senha.',
  ],
  EMAIL_CONFIRMATION: [
    'Confirmar e-mail',
    'Confirme seu endereço de e-mail pelo link enviado.',
  ],
  PASSWORD_CHANGED: [
    'Senha alterada',
    'Sua senha foi alterada e todas as sessões foram encerradas.',
  ],
  EMAIL_CONFIRMED: [
    'E-mail confirmado',
    'Seu endereço de e-mail foi confirmado.',
  ],
  ORDER_CREATED: [
    'Pedido recebido',
    'Recebemos seu pedido. Acompanhe os detalhes na sua conta.',
  ],
  PAYMENT_APPROVED: [
    'Pagamento aprovado',
    'O pagamento do seu pedido foi aprovado.',
  ],
  PAYMENT_FAILED: [
    'Pagamento não aprovado',
    'O pagamento não foi aprovado. Consulte seu pedido.',
  ],
  ORDER_SHIPPED: [
    'Pedido enviado',
    'Seu pedido foi enviado. Consulte os detalhes de entrega.',
  ],
  ORDER_DELIVERED: ['Pedido entregue', 'Seu pedido foi marcado como entregue.'],
  ORDER_CANCELLED: [
    'Pedido cancelado',
    'Seu pedido foi cancelado. Consulte os detalhes na sua conta.',
  ],
  RETURN_REQUESTED: [
    'Devolução solicitada',
    'Sua solicitação de devolução foi recebida.',
  ],
  RETURN_UPDATED: [
    'Devolução atualizada',
    'Há uma atualização na sua solicitação de devolução.',
  ],
  REFUND_UPDATED: [
    'Reembolso atualizado',
    'Consulte a atualização do reembolso na sua conta.',
  ],
  SELLER_APPROVED: ['Loja aprovada', 'O cadastro da sua loja foi aprovado.'],
  SELLER_CORRECTION: [
    'Cadastro precisa de ajuste',
    'Consulte os ajustes solicitados no cadastro da loja.',
  ],
  DOCUMENT_REQUESTED: [
    'Documento solicitado',
    'Há um documento solicitado no cadastro da sua loja.',
  ],
  DOCUMENT_REVIEWED: [
    'Documento analisado',
    'Consulte o resultado da análise do documento da sua loja.',
  ],
  FISCAL_AVAILABLE: [
    'Documento fiscal disponível',
    'Consulte o documento fiscal nos detalhes do pedido.',
  ],
  REVIEW_RECEIVED: [
    'Avaliação recebida',
    'Sua loja recebeu uma nova avaliação.',
  ],
  SUPPORT_UPDATED: [
    'Atendimento atualizado',
    'Consulte a atualização do atendimento na sua conta.',
  ],
} as const;
export type NotificationTemplate = keyof typeof notificationTemplates;
