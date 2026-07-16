/**
 * @atelier/integrations — handlers serveur vers les comptes DE L'UTILISATEUR :
 * github + vercel (Phase 4), resend + buffer (Phase 5), cf_pages (v1+).
 * Les tokens restent côté serveur (ActionExecutor) : jamais au frontend,
 * jamais dans les prompts des agents (SPEC.md §11).
 */

/** Types d'intégration supportés (aligné sur l'enum `integrations.kind` de packages/db). */
export type IntegrationKind = 'github' | 'vercel' | 'cf_pages' | 'resend' | 'buffer' | 'telegram';

export {
  createEmailSender,
  type EmailEnv,
  type EmailSender,
  type SendEmailInput,
} from './email';
export { type GithubRepoRef, getGithubUser, pushFiles } from './github';
export {
  createDeployment,
  pollDeployment,
  type VercelDeployInput,
  type VercelDeployment,
} from './vercel';
