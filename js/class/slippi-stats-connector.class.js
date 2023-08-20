class SlippiStatsConnector {
    constructor() {
        this.address = location.hostname;
        this.port = 42070;
        this.cache = null;

    }

    // async getStats(value) {
    //     let output = stats.fetchStats(value);
    //     this.cache = await output;
    //     return output;
    // }

    async getPlayerStats(id) {
        let query = `fragment profileFields on NetplayProfile {
            id
            ratingOrdinal
            ratingUpdateCount
            wins
            losses
            dailyGlobalPlacement
            dailyRegionalPlacement
            continent
            characters {
              id
              character
              gameCount
              __typename
            }
            __typename
          }
          
          fragment userProfilePage on User {
            fbUid
            displayName
            connectCode {
              code
              __typename
            }
            status
            activeSubscription {
              level
              hasGiftSub
              __typename
            }
            rankedNetplayProfile {
              ...profileFields
              __typename
            }
            netplayProfiles {
              ...profileFields
              season {
                id
                startedAt
                endedAt
                name
                status
                __typename
              }
              __typename
            }
            __typename
          }
          
          query AccountManagementPageQuery($cc: String!, $uid: String!) {
            getUser(fbUid: $uid) {
              ...userProfilePage
              __typename
            }
            getConnectCode(code: $cc) {
              user {
                ...userProfilePage
                __typename
              }
              __typename
            }
          }
          `
        let output = await fetch('https://gql-gateway-dot-slippi.uc.r.appspot.com/graphql',
            {
                method: 'post',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    operationName: "AccountManagementPageQuery",
                    query: query,
                    variables: {
                        cc: id,
                        uid: id
                    }
                }),
            });
        output = output.json();
        return output;
    }
    // async fetchStats(value) {
    //     let output;
    //     output = await fetch(`http://${this.address}:${this.port}/stats/${value}`);
    //     output = output.json();
    //     return output;

    // }

    moveId(move) {
        switch (move) {
            case 1:
                return "Item Throw";
            case 2:
                return "Jab";
            case 3:
                return "Jab";
            case 4:
                return "Jab";
            case 5:
                return "Jab";
            case 6:
                return "Dash Attack";
            case 7:
                return "Forward Tilt";
            case 8:
                return "Up Tilt";
            case 9:
                return "Down Tilt";
            case 10:
                return "Side Smash";
            case 11:
                return "Up Smash";
            case 12:
                return "Down Smash";
            case 13:
                return "Neutral Air";
            case 14:
                return "Forward Air";
            case 15:
                return "Back Air";
            case 16:
                return "Up Air";
            case 17:
                return "Down Air";
            case 18:
                return "Neutral Special";
            case 19:
                return "Side Special";
            case 20:
                return "Up Special";
            case 21:
                return "Down Special";
            case 50:
                return "Get Up Attack";
            case 51:
                return "Get Up Attack";
            case 52:
                return "Pummel";
            case 53:
                return "Forward Throw";
            case 54:
                return "Back Throw";
            case 55:
                return "Up Throw";
            case 56:
                return "Down Throw";
            case 57:
                return "Cargo Forward Throw";
            case 58:
                return "Cargo Back Throw";
            case 59:
                return "Cargo Up Throw";
            case 60:
                return "Cargo Down Throw";
            case 61:
                return "Ledge Attack";
            case 62:
                return "Ledge Attack";
            case 63:
                return "Beam Sword Jab";
            case 64:
                return "Beam Sword Tilt Swing";
            case 65:
                return "Beam Sword Smash Swing";
            case 66:
                return "Beam Sword Dash Swing";
            case 87:
                return "Peach Parasol";
            case 22:
                return "Kirby Copy";
            case 23:
                return "Kirby Copy";
            case 24:
                return "Kirby Copy";
            case 25:
                return "Kirby Copy";
            case 26:
                return "Kirby Copy";
            case 27:
                return "Kirby Copy";
            case 28:
                return "Kirby Copy";
            case 29:
                return "Kirby Copy";
            case 30:
                return "Kirby Copy";
            case 31:
                return "Kirby Copy";
            case 32:
                return "Kirby Copy";
            case 33:
                return "Kirby Copy";
            case 34:
                return "Kirby Copy";
            case 35:
                return "Kirby Copy";
            case 36:
                return "Kirby Copy";
            case 37:
                return "Kirby Copy";
            case 38:
                return "Kirby Copy";
            case 39:
                return "Kirby Copy";
            case 40:
                return "Kirby Copy";
            case 41:
                return "Kirby Copy";
            case 42:
                return "Kirby Copy";
            case 43:
                return "Kirby Copy";
            case 44:
                return "Kirby Copy";
            case 45:
                return "Kirby Copy";
            case 46:
                return "Kirby Copy";
            default:
                return `Unknown MoveID: ${move}`;
        }
    }
}