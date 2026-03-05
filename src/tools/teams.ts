import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export function registerTeamTools(
  server: McpServer,
  supabase: SupabaseClient
): void {
  server.tool(
    "list_teams",
    "List all hackathon teams",
    {
      limit: z.number().int().min(1).max(100).optional().describe("Max results to return (default 50)"),
      offset: z.number().int().min(0).optional().describe("Pagination offset"),
    },
    async ({ limit = 50, offset = 0 }) => {
      const { data, error } = await supabase
        .from("teams")
        .select("*, team_members(participant_id, participants(name, email))")
        .range(offset, offset + limit - 1)
        .order("created_at", { ascending: false });

      if (error) {
        return {
          content: [{ type: "text", text: `Error fetching teams: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "get_team",
    "Get a single team by ID with its members",
    {
      id: z.string().uuid().describe("Team UUID"),
    },
    async ({ id }) => {
      const { data, error } = await supabase
        .from("teams")
        .select("*, team_members(participant_id, participants(name, email))")
        .eq("id", id)
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Error fetching team: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "create_team",
    "Create a new hackathon team",
    {
      name: z.string().min(1).describe("Team name"),
      description: z.string().optional().describe("Team description or project idea"),
      max_members: z.number().int().min(1).max(10).optional().describe("Maximum team size (default 4)"),
    },
    async ({ name, description, max_members = 4 }) => {
      const { data, error } = await supabase
        .from("teams")
        .insert({ name, description, max_members })
        .select()
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Error creating team: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "update_team",
    "Update an existing team's information",
    {
      id: z.string().uuid().describe("Team UUID"),
      name: z.string().min(1).optional().describe("Team name"),
      description: z.string().optional().describe("Team description or project idea"),
      max_members: z.number().int().min(1).max(10).optional().describe("Maximum team size"),
    },
    async ({ id, name, description, max_members }) => {
      const updates: Record<string, string | number> = {};
      if (name !== undefined) updates["name"] = name;
      if (description !== undefined) updates["description"] = description;
      if (max_members !== undefined) updates["max_members"] = max_members;

      const { data, error } = await supabase
        .from("teams")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Error updating team: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "delete_team",
    "Delete a hackathon team",
    {
      id: z.string().uuid().describe("Team UUID"),
    },
    async ({ id }) => {
      const { error } = await supabase
        .from("teams")
        .delete()
        .eq("id", id);

      if (error) {
        return {
          content: [{ type: "text", text: `Error deleting team: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Team ${id} deleted successfully` }],
      };
    }
  );

  server.tool(
    "add_team_member",
    "Add a participant to a team",
    {
      team_id: z.string().uuid().describe("Team UUID"),
      participant_id: z.string().uuid().describe("Participant UUID"),
    },
    async ({ team_id, participant_id }) => {
      const { data, error } = await supabase
        .from("team_members")
        .insert({ team_id, participant_id })
        .select()
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Error adding team member: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "remove_team_member",
    "Remove a participant from a team",
    {
      team_id: z.string().uuid().describe("Team UUID"),
      participant_id: z.string().uuid().describe("Participant UUID"),
    },
    async ({ team_id, participant_id }) => {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("team_id", team_id)
        .eq("participant_id", participant_id);

      if (error) {
        return {
          content: [{ type: "text", text: `Error removing team member: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Participant ${participant_id} removed from team ${team_id}` }],
      };
    }
  );
}
