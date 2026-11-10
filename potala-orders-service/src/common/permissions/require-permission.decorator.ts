import { SetMetadata } from '@nestjs/common';
import { PermissionCode } from './permission-catalog.mirror';

export const PERMISSION_REQUIREMENT_KEY = 'permissionRequirement';

/**
 * Como o recurso da rota se relaciona com vendedores -- define quais escopos
 * de concessão (GLOBAL, SELLERS, OWN_STORE) o cobririam:
 *
 * - `PLATFORM`: recurso da plataforma, sem dono vendedor (categorias,
 *   cupons da plataforma, conteúdos). Só GLOBAL cobre.
 * - `COLLECTION`: listagem que hoje devolve dados de todos os vendedores.
 *   GLOBAL cobre; SELLERS/OWN_STORE só cobririam com um filtro por vendedor
 *   que AINDA NÃO EXISTE na consulta (registrado como `requiresFilter`).
 * - `SELLER`: a própria rota identifica o vendedor alvo (`sellerIdParam`).
 * - `SELLER_OWNED`: recurso de um vendedor (produto, pedido, devolução,
 *   reclamação, disputa) cujo dono não é conhecido sem consulta ao banco.
 *   Nesta fase nenhuma consulta é acrescentada: GLOBAL cobre; escopos por
 *   vendedor ficam "não avaliados".
 */
export type PermissionScope =
  | { mode: 'PLATFORM' }
  | { mode: 'COLLECTION' }
  | { mode: 'SELLER'; sellerIdParam: string }
  | { mode: 'SELLER_OWNED' };

export type PermissionRequirement =
  | { kind: 'required'; permission: PermissionCode; scope: PermissionScope }
  | { kind: 'pending'; reason: string };

/** Declares the permission and scope enforced by the global RolesGuard.
 * Collections without a proven server filter reject scoped grants.
 * Missing/pending metadata is restricted to explicitly bootstrapped superadmins.
 */
export const RequirePermission = (
  permission: PermissionCode,
  scope: PermissionScope,
) =>
  SetMetadata<string, PermissionRequirement>(PERMISSION_REQUIREMENT_KEY, {
    kind: 'required',
    permission,
    scope,
  });

/**
 * Rota administrativa SEM código correspondente no catálogo F1.2. Declaração
 * explícita (o teste de cobertura recusa rota administrativa sem nenhuma das
 * duas marcações) até o catálogo do identity-service ganhar o código.
 */
export const PermissionPending = (reason: string) =>
  SetMetadata<string, PermissionRequirement>(PERMISSION_REQUIREMENT_KEY, {
    kind: 'pending',
    reason,
  });
