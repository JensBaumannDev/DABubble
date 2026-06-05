import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type MessageWithReactions = {
  id: string;
  reactions: Record<string, string[]> | null;
};

type ChannelMembershipRow = {
  user_id: string;
};

type OwnedChannelRow = {
  id: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

async function reassignOrDeleteOwnedChannels(adminClient: SupabaseClient, userId: string): Promise<void> {
  const { data: ownedChannels, error: channelsError } = await adminClient
    .from('channels')
    .select('id')
    .eq('created_by', userId);

  if (channelsError) {
    throw channelsError;
  }

  for (const channel of (ownedChannels ?? []) as OwnedChannelRow[]) {
    const { data: remainingMembers, error: membersError } = await adminClient
      .from('channel_members')
      .select('user_id')
      .eq('channel_id', channel.id)
      .neq('user_id', userId)
      .limit(1);

    if (membersError) {
      throw membersError;
    }

    const nextOwnerId = remainingMembers?.[0]?.user_id;

    if (nextOwnerId) {
      const { error: updateError } = await adminClient
        .from('channels')
        .update({ created_by: nextOwnerId })
        .eq('id', channel.id);

      if (updateError) {
        throw updateError;
      }

      continue;
    }

    const { error: deleteChannelMessagesError } = await adminClient
      .from('messages')
      .delete()
      .eq('channel_id', channel.id);

    if (deleteChannelMessagesError) {
      throw deleteChannelMessagesError;
    }

    const { error: deleteMembersError } = await adminClient
      .from('channel_members')
      .delete()
      .eq('channel_id', channel.id);

    if (deleteMembersError) {
      throw deleteMembersError;
    }

    const { error: deleteChannelError } = await adminClient
      .from('channels')
      .delete()
      .eq('id', channel.id);

    if (deleteChannelError) {
      throw deleteChannelError;
    }
  }
}

async function removeUserReactions(adminClient: SupabaseClient, userId: string): Promise<void> {
  const { data: messagesWithReactions, error: messagesError } = await adminClient
    .from('messages')
    .select('id, reactions')
    .not('reactions', 'is', null);

  if (messagesError) {
    throw messagesError;
  }

  for (const message of (messagesWithReactions ?? []) as MessageWithReactions[]) {
    if (!message.reactions) {
      continue;
    }

    let hasChanges = false;
    const nextReactions = Object.entries(message.reactions).reduce<Record<string, string[]>>((result, [emoji, userIds]) => {
      const remainingUserIds = userIds.filter((id) => id !== userId);

      if (remainingUserIds.length !== userIds.length) {
        hasChanges = true;
      }

      if (remainingUserIds.length > 0) {
        result[emoji] = remainingUserIds;
      }

      return result;
    }, {});

    if (!hasChanges) {
      continue;
    }

    const { error: updateError } = await adminClient
      .from('messages')
      .update({ reactions: Object.keys(nextReactions).length > 0 ? nextReactions : null })
      .eq('id', message.id);

    if (updateError) {
      throw updateError;
    }
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authHeader = request.headers.get('Authorization');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return json({ error: 'Missing Supabase environment variables.' }, 500);
    }

    if (!authHeader) {
      return json({ error: 'Missing authorization header.' }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: 'Unauthorized.' }, 401);
    }

    const userId = user.id;

    await reassignOrDeleteOwnedChannels(adminClient, userId);
    await removeUserReactions(adminClient, userId);

    const { error: deleteMembershipsError } = await adminClient
      .from('channel_members')
      .delete()
      .eq('user_id', userId);

    if (deleteMembershipsError) {
      throw deleteMembershipsError;
    }

    const { error: deleteMessagesError } = await adminClient
      .from('messages')
      .delete()
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);

    if (deleteMessagesError) {
      throw deleteMessagesError;
    }

    const { error: deleteProfileError } = await adminClient
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (deleteProfileError) {
      throw deleteProfileError;
    }

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      throw deleteUserError;
    }

    return json({ success: true });
  } catch (error) {
    console.error('delete-account function failed:', error);
    return json({ error: 'Account deletion failed.' }, 500);
  }
});