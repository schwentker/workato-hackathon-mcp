import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export function registerAwardTools(
  server: McpServer,
  supabase: SupabaseClient
): void {
  server.tool(
    "list_awards",
    "List all hackathon awards and prizes",
    {
      limit: z.number().int().min(1).max(100).optional().describe("Max results to return (default 50)"),
      offset: z.number().int().min(0).optional().describe("Pagination offset"),
    },
    async ({ limit = 50, offset = 0 }) => {
      const { data, error } = await supabase
        .from("awards")
        .select("*, teams(name), submissions(title)")
        .range(offset, offset + limit - 1)
        .order("rank", { ascending: true });

      if (error) {
        return {
          content: [{ type: "text", text: `Error fetching awards: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "get_award",
    "Get a single award by ID",
    {
      id: z.string().uuid().describe("Award UUID"),
    },
    async ({ id }) => {
      const { data, error } = await supabase
        .from("awards")
        .select("*, teams(name, team_members(participants(name))), submissions(title)")
        .eq("id", id)
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Error fetching award: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "create_award",
    "Create a new award category",
    {
      name: z.string().min(1).describe("Award name (e.g. 'Best AI Integration', 'Most Innovative')"),
      description: z.string().optional().describe("Award description"),
      prize: z.string().optional().describe("Prize description (e.g. '$500', 'Trophy + recognition')"),
      rank: z.number().int().min(1).optional().describe("Display rank/order for this award"),
    },
    async ({ name, description, prize, rank }) => {
      const { data, error } = await supabase
        .from("awards")
        .insert({ name, description, prize, rank })
        .select()
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Error creating award: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "assign_award",
    "Assign an award to a team and their submission",
    {
      award_id: z.string().uuid().describe("Award UUID"),
      team_id: z.string().uuid().describe("Winning team UUID"),
      submission_id: z.string().uuid().describe("Winning submission UUID"),
      notes: z.string().optional().describe("Judges' notes or reason for selection"),
    },
    async ({ award_id, team_id, submission_id, notes }) => {
      const { data, error } = await supabase
        .from("awards")
        .update({
          team_id,
          submission_id,
          notes,
          awarded_at: new Date().toISOString(),
        })
        .eq("id", award_id)
        .select()
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Error assigning award: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "revoke_award",
    "Remove a team assignment from an award",
    {
      award_id: z.string().uuid().describe("Award UUID"),
    },
    async ({ award_id }) => {
      const { data, error } = await supabase
        .from("awards")
        .update({
          team_id: null,
          submission_id: null,
          notes: null,
          awarded_at: null,
        })
        .eq("id", award_id)
        .select()
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Error revoking award: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "get_leaderboard",
    "Get the current hackathon leaderboard ranked by average scores",
    {
      limit: z.number().int().min(1).max(50).optional().describe("Number of teams to show (default 10)"),
    },
    async ({ limit = 10 }) => {
      // Aggregate average scores per submission joined with team info
      const { data, error } = await supabase
        .from("scores")
        .select("submission_id, total, submissions(title, team_id, teams(name))")
        .order("total", { ascending: false })
        .limit(limit * 5); // over-fetch to allow grouping

      if (error) {
        return {
          content: [{ type: "text", text: `Error fetching leaderboard: ${error.message}` }],
          isError: true,
        };
      }

      // Group by submission and compute averages
      const bySubmission = new Map<string, { submission_id: string; scores: number[]; meta: unknown }>();
      for (const row of data ?? []) {
        const id = row.submission_id as string;
        if (!bySubmission.has(id)) {
          bySubmission.set(id, { submission_id: id, scores: [], meta: row.submissions });
        }
        bySubmission.get(id)!.scores.push(row.total as number);
      }

      const leaderboard = Array.from(bySubmission.values())
        .map(({ submission_id, scores, meta }) => ({
          submission_id,
          meta,
          average_total: scores.reduce((a, b) => a + b, 0) / scores.length,
          judge_count: scores.length,
        }))
        .sort((a, b) => b.average_total - a.average_total)
        .slice(0, limit)
        .map((entry, idx) => ({ rank: idx + 1, ...entry }));

      return {
        content: [{ type: "text", text: JSON.stringify(leaderboard, null, 2) }],
      };
    }
  );
}
