ALTER TABLE "pool_tokens" DROP CONSTRAINT "pool_tokens_pool_external_id_token_address_unique";--> statement-breakpoint
ALTER TABLE "pool_tokens" ADD CONSTRAINT "pool_tokens_pool_external_id_token_id_unique" UNIQUE("pool_external_id","token_id");