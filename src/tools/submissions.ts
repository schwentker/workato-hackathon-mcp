import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const SubmissionStatus = z.enum(["draft", "submitted", "under_review", "scored"]);

export function registerSubmissionTools(
  server: McpServer,
  supabase: SupabaseClient
): void {
  server.tool(
    "list_submissions",
    "List all hackathon project submissions",
    {
      limit: z.number().int().min(1).max(100).optional().describe("Max results to return (default 50)"),
      offset: z.number().int().min(0).optional().describe("Pagination offset"),
      status: SubmissionStatus.optional().describe("Filter by submission status"),
      team_id: z.string().uuid().optional().describe("Filter by team ID"),
    },
    async ({ limit = 50, offset = 0, status, team_id }) => {
      let query = supabase
        .from("submissions")
        .select("*, teams(name)")
        .range(offset, offset + limit - 1)
        .order("submitted_at", { ascending: false });

      if (status !== undefined) query = query.eq("status", status);
      if (team_id !== undefined) query = query.eq("team_id", team_id);

      const { data, error } = await query;

      if (error) {
        return {
          content: [{ type: "text", text: `Error fetching submissions: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "get_submission",
    "Get a single submission by ID",
    {
      id: z.string().uuid().describe("Submission UUID"),
    },
    async ({ id }) => {
      const { data, error } = await supabase
        .from("submissions")
        .select("*, teams(name, team_members(participants(name, email)))")
        .eq("id", id)
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Error fetching submission: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "create_submission",
    "Create a new project submission for a team",
    {
      team_id: z.string().uuid().describe("Team UUID"),
      title: z.string().min(1).describe("Project title"),
      description: z.string().min(1).describe("Project description"),
      repo_url: z.string().url().optional().describe("GitHub or repository URL"),
      demo_url: z.string().url().optional().describe("Live demo URL"),
      video_url: z.string().url().optional().describe("Demo video URL"),
    },
    async ({ team_id, title, description, repo_url, demo_url, video_url }) => {
      const { data, error } = await supabase
        .from("submissions")
        .insert({
          team_id,
          title,
          description,
          repo_url,
          demo_url,
          video_url,
          status: "draft",
        })
        .select()
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Error creating submission: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "update_submission",
    "Update an existing submission",
    {
      id: z.string().uuid().describe("Submission UUID"),
      title: z.string().min(1).optional().describe("Project title"),
      description: z.string().min(1).optional().describe("Project description"),
      repo_url: z.string().url().optional().describe("GitHub or repository URL"),
      demo_url: z.string().url().optional().describe("Live demo URL"),
      video_url: z.string().url().optional().describe("Demo video URL"),
      status: SubmissionStatus.optional().describe("Submission status"),
    },
    async ({ id, title, description, repo_url, demo_url, video_url, status }) => {
      const updates: Record<string, string> = {};
      if (title !== undefined) updates["title"] = title;
      if (description !== undefined) updates["description"] = description;
      if (repo_url !== undefined) updates["repo_url"] = repo_url;
      if (demo_url !== undefined) updates["demo_url"] = demo_url;
      if (video_url !== undefined) updates["video_url"] = video_url;
      if (status !== undefined) {
        updates["status"] = status;
        if (status === "submitted") {
          updates["submitted_at"] = new Date().toISOString();
        }
      }

      const { data, error } = await supabase
        .from("submissions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Error updating submission: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "score_submission",
    "Record a score for a submission",
    {
      submission_id: z.string().uuid().describe("Submission UUID"),
      judge_id: z.string().uuid().describe("Judge participant UUID"),
      innovation: z.number().min(0).max(10).describe("Innovation score (0–10)"),
      technical: z.number().min(0).max(10).describe("Technical execution score (0–10)"),
      impact: z.number().min(0).max(10).describe("Business impact score (0–10)"),
      presentation: z.number().min(0).max(10).describe("Presentation score (0–10)"),
      notes: z.string().optional().describe("Judge's notes or feedback"),
    },
    async ({ submission_id, judge_id, innovation, technical, impact, presentation, notes }) => {
      const total = innovation + technical + impact + presentation;

      const { data, error } = await supabase
        .from("scores")
        .upsert(
          { submission_id, judge_id, innovation, technical, impact, presentation, total, notes },
          { onConflict: "submission_id,judge_id" }
        )
        .select()
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Error recording score: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "get_submission_scores",
    "Get all scores for a submission with averages",
    {
      submission_id: z.string().uuid().describe("Submission UUID"),
    },
    async ({ submission_id }) => {
      const { data, error } = await supabase
        .from("scores")
        .select("*, participants(name)")
        .eq("submission_id", submission_id);

      if (error) {
        return {
          content: [{ type: "text", text: `Error fetching scores: ${error.message}` }],
          isError: true,
        };
      }

      if (!data || data.length === 0) {
        return {
          content: [{ type: "text", text: "No scores recorded yet for this submission" }],
        };
      }

      const avg = (field: string) =>
        data.reduce((sum: number, s: Record<string, number>) => sum + (s[field] ?? 0), 0) / data.length;

      const averages = {
        innovation: avg("innovation"),
        technical: avg("technical"),
        impact: avg("impact"),
        presentation: avg("presentation"),
        total: avg("total"),
        judge_count: data.length,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ scores: data, averages }, null, 2),
          },
        ],
      };
    }
  );
}
