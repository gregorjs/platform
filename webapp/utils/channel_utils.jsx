
import Constants from 'utils/constants.jsx';
const Preferences = Constants.Preferences;

import * as Utils from 'utils/utils.jsx';

import UserStore from 'stores/user_store.jsx';
import TeamStore from 'stores/team_store.jsx';
import PreferenceStore from 'stores/preference_store.jsx';
import LocalizationStore from 'stores/localization_store.jsx';

/**
 * Returns list of sorted channels grouped by type. Favorites here is considered as separated type.
 *
 * Example: {
 *  publicChannels: [...],
 *  privateChannels: [...],
 *  directChannels: [...],
 *  directNonTeamChannels: [...],
 *  favoriteChannels: [...]
 * }
 */
export function buildDisplayableChannelList(persistentChannels) {
    const missingDMChannels = createMissingDirectChannels(persistentChannels);

    const channels = persistentChannels.concat(missingDMChannels).map(completeDirectChannelInfo);
    channels.sort(sortChannelsByDisplayName);

    const favoriteChannels = channels.filter(isFavoriteChannel);
    const notFavoriteChannels = channels.filter(not(isFavoriteChannel));
    const directChannels = notFavoriteChannels.filter(andX(isDirectChannel, isDirectChannelVisible));

    return {
        favoriteChannels,
        publicChannels: notFavoriteChannels.filter(isOpenChannel),
        privateChannels: notFavoriteChannels.filter(isPrivateChannel),
        directChannels: directChannels.filter(isConnectedToTeamMember),
        directNonTeamChannels: directChannels.filter(isNotConnectedToTeamMember)
    };
}

export function isFavoriteChannel(channel) {
    return PreferenceStore.getBool(Preferences.CATEGORY_FAVORITE_CHANNEL, channel.id);
}

export function isOpenChannel(channel) {
    return channel.type === Constants.OPEN_CHANNEL;
}

export function isPrivateChannel(channel) {
    return channel.type === Constants.PRIVATE_CHANNEL;
}

export function isDirectChannel(channel) {
    return channel.type === Constants.DM_CHANNEL;
}

export function isDirectChannelVisible(channel) {
    const channelId = Utils.getUserIdFromChannelName(channel);

    return PreferenceStore.getBool(Preferences.CATEGORY_DIRECT_CHANNEL_SHOW, channelId);
}

export function completeDirectChannelInfo(channel) {
    if (!isDirectChannel(channel)) {
        return channel;
    }

    const dmChannelClone = JSON.parse(JSON.stringify(channel));
    const teammateId = Utils.getUserIdFromChannelName(channel);

    return Object.assign(dmChannelClone, {
        display_name: Utils.displayUsername(teammateId),
        teammate_id: teammateId,
        status: UserStore.getStatus(teammateId) || 'offline'
    });
}

const defaultPrefix = 'D'; // fallback for future types
const typeToPrefixMap = {[Constants.OPEN_CHANNEL]: 'A', [Constants.PRIVATE_CHANNEL]: 'B', [Constants.DM_CHANNEL]: 'C'};

export function sortChannelsByDisplayName(a, b) {
    const locale = LocalizationStore.getLocale();

    if (a.type !== b.type) {
        return (typeToPrefixMap[a.type] || defaultPrefix).localeCompare((typeToPrefixMap[b.type] || defaultPrefix), locale);
    }

    if (a.display_name !== b.display_name) {
        return a.display_name.localeCompare(b.display_name, locale, {numeric: true});
    }

    return a.name.localeCompare(b.name, locale, {numeric: true});
}

export function showCreateOption(channelType, isAdmin, isSystemAdmin) {
    if (global.window.mm_license.IsLicensed !== 'true') {
        return true;
    }

    if (channelType === Constants.OPEN_CHANNEL) {
        if (global.window.mm_config.RestrictPublicChannelCreation === Constants.PERMISSIONS_SYSTEM_ADMIN && !isSystemAdmin) {
            return false;
        } else if (global.window.mm_config.RestrictPublicChannelCreation === Constants.PERMISSIONS_TEAM_ADMIN && !isAdmin) {
            return false;
        }
    } else if (channelType === Constants.PRIVATE_CHANNEL) {
        if (global.window.mm_config.RestrictPrivateChannelCreation === Constants.PERMISSIONS_SYSTEM_ADMIN && !isSystemAdmin) {
            return false;
        } else if (global.window.mm_config.RestrictPrivateChannelCreation === Constants.PERMISSIONS_TEAM_ADMIN && !isAdmin) {
            return false;
        }
    }

    return true;
}

export function showManagementOptions(channel, isAdmin, isSystemAdmin) {
    if (global.window.mm_license.IsLicensed !== 'true') {
        return true;
    }

    if (channel.type === Constants.OPEN_CHANNEL) {
        if (global.window.mm_config.RestrictPublicChannelManagement === Constants.PERMISSIONS_SYSTEM_ADMIN && !isSystemAdmin) {
            return false;
        }
        if (global.window.mm_config.RestrictPublicChannelManagement === Constants.PERMISSIONS_TEAM_ADMIN && !isAdmin) {
            return false;
        }
    } else if (channel.type === Constants.PRIVATE_CHANNEL) {
        if (global.window.mm_config.RestrictPrivateChannelManagement === Constants.PERMISSIONS_SYSTEM_ADMIN && !isSystemAdmin) {
            return false;
        }
        if (global.window.mm_config.RestrictPrivateChannelManagement === Constants.PERMISSIONS_TEAM_ADMIN && !isAdmin) {
            return false;
        }
    }

    return true;
}

export function showDeleteOption(channel, isAdmin, isSystemAdmin) {
    if (global.window.mm_license.IsLicensed !== 'true') {
        return true;
    }

    if (channel.type === Constants.OPEN_CHANNEL) {
        if (global.window.mm_config.RestrictPublicChannelDeletion === Constants.PERMISSIONS_SYSTEM_ADMIN && !isSystemAdmin) {
            return false;
        }
        if (global.window.mm_config.RestrictPublicChannelDeletion === Constants.PERMISSIONS_TEAM_ADMIN && !isAdmin) {
            return false;
        }
    } else if (channel.type === Constants.PRIVATE_CHANNEL) {
        if (global.window.mm_config.RestrictPrivateChannelDeletion === Constants.PERMISSIONS_SYSTEM_ADMIN && !isSystemAdmin) {
            return false;
        }
        if (global.window.mm_config.RestrictPrivateChannelDeletion === Constants.PERMISSIONS_TEAM_ADMIN && !isAdmin) {
            return false;
        }
    }

    return true;
}

/*
 * not exported helpers
 */

function createMissingDirectChannels(channels) {
    const directChannelsDisplayPreferences = PreferenceStore.getCategory(Preferences.CATEGORY_DIRECT_CHANNEL_SHOW);

    return Array.
        from(directChannelsDisplayPreferences).
        filter((entry) => entry[1] === 'true').
        map((entry) => entry[0]).
        filter((teammateId) => !channels.some(Utils.isDirectChannelForUser.bind(null, teammateId))).
        map(createFakeChannelCurried(UserStore.getCurrentId()));
}

function createFakeChannel(userId, otherUserId) {
    return {
        name: Utils.getDirectChannelName(userId, otherUserId),
        last_post_at: 0,
        total_msg_count: 0,
        type: Constants.DM_CHANNEL,
        fake: true
    };
}

function createFakeChannelCurried(userId) {
    return (otherUserId) => createFakeChannel(userId, otherUserId);
}

function isConnectedToTeamMember(channel) {
    return isTeamMember(channel.teammate_id);
}

function isTeamMember(userId) {
    return TeamStore.hasActiveMemberInTeam(TeamStore.getCurrentId(), userId);
}

function isNotConnectedToTeamMember(channel) {
    return TeamStore.hasMemberNotInTeam(TeamStore.getCurrentId(), channel.teammate_id);
}

function not(f) {
    return (...args) => !f(...args);
}

function andX(...fns) {
    return (...args) => fns.every((f) => f(...args));
}
