DO $$ BEGIN
 CREATE TYPE "public"."tournament_region" AS ENUM('NA', 'EU', 'ASIA', 'OCEA', 'SA');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."tournament_status" AS ENUM('draft', 'waiting', 'start', 'in_progress', 'complete');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"discord_id" text NOT NULL,
	"name" text NOT NULL,
	"type" integer NOT NULL,
	"no_talk" boolean NOT NULL,
	"messages" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "channels_discord_id_unique" UNIQUE("discord_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "history_team_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" bigint NOT NULL,
	"tournament_id" integer NOT NULL,
	"match_id" integer NOT NULL,
	"kills" integer NOT NULL,
	"deaths" integer NOT NULL,
	"assists" integer NOT NULL,
	"rounds_won" integer NOT NULL,
	"rounds_lost" integer NOT NULL,
	"score" integer NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "history_user_stats" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"match_id" bigint NOT NULL,
	"kill" integer NOT NULL,
	"assist" integer NOT NULL,
	"death" integer NOT NULL,
	"damage" integer NOT NULL,
	"rating" integer NOT NULL,
	"ping" integer NOT NULL,
	"win" boolean NOT NULL,
	"sponsor" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "images" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"name" text NOT NULL,
	"user_id" bigint NOT NULL,
	"analysis" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"players" json NOT NULL,
	"discord_channel_id" text NOT NULL,
	"map" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"team1_name" text NOT NULL,
	"team2_name" text NOT NULL,
	"team1_score" integer NOT NULL,
	"team2_score" integer NOT NULL,
	"team1_id" bigint NOT NULL,
	"team2_id" bigint NOT NULL,
	"screenshots" text[],
	"round" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"discord_id" text NOT NULL,
	"name" text NOT NULL,
	"type" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "roles_discord_id_unique" UNIQUE("discord_id"),
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_stats" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"elo" integer DEFAULT 1000 NOT NULL,
	"avg_kill" real DEFAULT -1 NOT NULL,
	"avg_assist" real DEFAULT -1 NOT NULL,
	"avg_death" real DEFAULT -1 NOT NULL,
	"avg_damage" real DEFAULT -1 NOT NULL,
	"avg_rating" real DEFAULT -1 NOT NULL,
	"avg_ping" real DEFAULT -1 NOT NULL,
	"winrate" integer DEFAULT -1 NOT NULL,
	"game_played" integer DEFAULT -1 NOT NULL,
	"history_ids" text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"role_id" bigint NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"voice_channel_id" text NOT NULL,
	"owner_id" bigint NOT NULL,
	"member_ids" text NOT NULL,
	"history_member_ids" text NOT NULL,
	"is_disabled" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_time" timestamp NOT NULL,
	"max_team_limit" integer NOT NULL,
	"prize" text NOT NULL,
	"teams" text NOT NULL,
	"waiting_list" text NOT NULL,
	"matches" jsonb NOT NULL,
	"bracket" text NOT NULL,
	"status" text NOT NULL,
	"region" "tournament_region" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"avg_kills" real DEFAULT -1 NOT NULL,
	"avg_deaths" real DEFAULT -1 NOT NULL,
	"avg_assists" real DEFAULT -1 NOT NULL,
	"avg_damage" real DEFAULT -1 NOT NULL,
	"avg_rating" real DEFAULT -1 NOT NULL,
	"avg_ping" real DEFAULT -1 NOT NULL,
	"win_rate" real DEFAULT -1 NOT NULL,
	"matches_played" integer DEFAULT -1 NOT NULL,
	"wins" integer DEFAULT -1 NOT NULL,
	"losses" integer DEFAULT -1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"discord_id" varchar(20) NOT NULL,
	"steam_id" text NOT NULL,
	"steam_username" text,
	"team_id" bigint,
	"region" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"roles" text DEFAULT '[]' NOT NULL,
	"role_db" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "history_team_stats" ADD CONSTRAINT "history_team_stats_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams" ADD CONSTRAINT "teams_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idIndex" ON "teams" USING btree ("id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ownerIdIndex" ON "teams" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usersIdIndex" ON "users" USING btree ("id");