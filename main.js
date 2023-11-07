const firebaseDatabaseURL = "https://multiplayer-demo-2f287-default-rtdb.firebaseio.com";
const playersPath = "lobby.json"; // Path to players data
const gamesPath = "games.json"; // Path to games data

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const checkPlayersAndCreateRoom = async () => {
    let loops = 1;
    let locallyTrackedLobbyPlayers = {}
    while (true) {
        try {
            const response = await fetch(`${firebaseDatabaseURL}/${playersPath}`);
            const data = await response.json();
            // Filter out objects where gameId is not "null"
            // Remove players that haven't sent a heartbeat in the last thirty seconds
            removeInactiveLobbyPlayers(locallyTrackedLobbyPlayers, data);
            //console.log(locallyTrackedLobbyPlayers)
            // Filter out objects where gameId is not "null"
            const filteredAndReadyData = filterPlayersByGameId(data);
            //console.log(filteredAndReadyData)
            
            if (areAllPlayersReady(filteredAndReadyData)) {
                createRoom(filteredAndReadyData);
                //break; // Exit the loop once a room is created
                await delay(1000);
            } else {
                console.log("Not all players are ready. Waiting..." + ` (${loops})`);
            }

            await delay(30000); // Wait for 1 second before checking again
            loops++;
        } catch (error) {
            console.error("Error reading data:", error);
            await delay(30000); // Wait for 1 second before retrying after an error
        }
    }
};

// Function to remove players that haven't sent a heartbeat within the last thirty seconds
const removeInactiveLobbyPlayers = (locallyTrackedLobbyPlayers, originalData) => {
    const currentTime = Date.now();
    const thirtySecondsAgo = currentTime - 30 * 1000; // 30 seconds in milliseconds

    for (const originalKey in originalData) {
        if (!Object.hasOwnProperty.call(locallyTrackedLobbyPlayers, originalKey)) {
            // If the key doesn't exist in locallyTrackedLobbyPlayers, add it
            // with the current timestamp and heartbeat from originalData
            locallyTrackedLobbyPlayers[originalKey] = {
            timestamp: currentTime,
            heartbeat: originalData[originalKey][Object.keys(originalData[originalKey])[0]].heartbeat,
        };
    } else {
      // If the key exists, iterate through the inner keys to find the right one
        for (const innerKey in originalData[originalKey]) {
            if (Object.hasOwnProperty.call(originalData[originalKey], innerKey) && originalData[originalKey][innerKey].heartbeat > locallyTrackedLobbyPlayers[originalKey].heartbeat) {
                // Update the timestamp and heartbeat
                locallyTrackedLobbyPlayers[originalKey] = {
                    timestamp: currentTime,
                    heartbeat: originalData[originalKey][innerKey].heartbeat,
                };
                break; // Exit the inner loop once we've found the correct inner key
            }
        }
      }

        // Check if the player's timestamp is older than 30 seconds
        if (
            Object.hasOwnProperty.call(locallyTrackedLobbyPlayers, originalKey) &&
            locallyTrackedLobbyPlayers[originalKey].timestamp < thirtySecondsAgo
        ) {
            // Remove the player from locallyTrackedLobbyPlayers
            delete locallyTrackedLobbyPlayers[originalKey];
            delete originalData[originalKey];
            // Send a delete request to Firebase to remove the player's data
            try {
                fetch(`${firebaseDatabaseURL}/lobby/${originalKey}.json`, {
                    method: "DELETE",
                });
                console.log(`Deleted player data for ${originalKey}`);
            } catch (error) {
                console.error(`Error deleting player data for ${originalKey}:`, error);
            }
        }
        }
  };
  
  
//ADD LOGIC FOR LAST UPDATE 
const monitorActiveGame = async (gameId) => {
    let roundNumber = 1;
    const roundLimit = 5;
    const tickLimit = 1200;
    let totalTicks = 0;
    let locallyTrackedPlayers = {}
    const blockedSpaces = {};
    const coinSpaces = {};

    for (const key in mapBlockedSpaces) {
        blockedSpaces[key] = true;
    }

    while (totalTicks < tickLimit) {
        try {
            const response = await fetch(`${firebaseDatabaseURL}/games/${gameId}.json`);
            const data = await response.json();
            let isUpdated = false;
            removeInactiveGamePlayers(locallyTrackedPlayers, data.players, gameId);


            if (Object.keys(data.players).length < 2) {
                break;
            }
            if (!data.gameState.coins && roundNumber == roundLimit) {
                console.log("gameOver")
                break;
            }

            for (const playerId in data.players) {
                if (data.players.hasOwnProperty(playerId)) {
                  const player = data.players[playerId];
                  
                 // console.log(player.position)
                  if (data.gameState.coins && player && player.position && data.gameState.coins[`${player.position.x}x${player.position.y}`]) {
                    //console.log(`Player named ${player.name} grabbed coin at position (${player.position.x},${player.position.y})`);
                    delete data.gameState.coins[`${player.position.x}x${player.position.y}`];
                    data.players[playerId].coins += 1;
                    isUpdated = true;
                  }
                  else if (!data.gameState.coins) {
                    // start a new round, spawn new coins
                    createNewRound(blockedSpaces, coinSpaces, data)
                    isUpdated = true;
                    roundNumber++;
                  }
                }
            }

            if (isUpdated) {
                fetch(`${firebaseDatabaseURL}/games/${gameId}.json`, {
                    method: "PUT",
                    body: JSON.stringify(data),
                    headers: {
                        "Content-Type": "application/json",
                    },
                }).then((response) => {
                    if (!response.ok) {
                        console.log(response)
                        throw new Error('Network response was not ok');
                    }
                })
            }

            totalTicks++;
            await delay(150); // Check player postions on this delay
        } catch (error) {
            console.error("Error reading data:", error);
        }
    }

    // delete game
    await delay(1000)
    try {
        fetch(`${firebaseDatabaseURL}/games/${gameId}.json`, {
            method: "DELETE",
        });
        console.log(`Deleted game ${gameId}`);
    } catch (error) {
        console.error(`Error deleting game ${gameId}:`, error);
    }
};

// Function to remove players that haven't sent a heartbeat within the last thirty seconds
const removeInactiveGamePlayers = (locallyTrackedPlayers, players, gameId) => {
    const currentTime = Date.now();
    const thirtySecondsAgo = currentTime - 30 * 1000; // 30 seconds in milliseconds
    const playerIds = Object.keys(players ?? []);
    if (playerIds.length == 0) return;
    
    playerIds.forEach((playerId) => {
        if (!Object.hasOwnProperty.call(locallyTrackedPlayers, playerId) || (Object.hasOwnProperty.call(locallyTrackedPlayers, playerId) && players[playerId].heartbeat > locallyTrackedPlayers[playerId].heartbeat)) {
            // If the key doesn't exist in locallyTrackedPlayers, add it
            // with the current timestamp and heartbeat from originalData
            locallyTrackedPlayers[playerId] = {
                timestamp: currentTime,
                heartbeat: players[playerId].heartbeat,
            };
        } 

        // Check if the player's timestamp is older than 30 seconds
        if (
            Object.hasOwnProperty.call(locallyTrackedPlayers, playerId) &&
            locallyTrackedPlayers[playerId].timestamp < thirtySecondsAgo
        ) {
            // Remove the player from locallyTrackedPlayers
            delete locallyTrackedPlayers[playerId];
            delete players[playerId];
            // Send a delete request to Firebase to remove the player's data
            try {
                fetch(`${firebaseDatabaseURL}/games/${gameId}/players/${playerId}.json`, {
                    method: "DELETE",
                });
                console.log(`Deleted player data for ${playerId}`);
            } catch (error) {
                console.error(`Error deleting player data for ${playerId}:`, error);
            }
        }
    });
  };

// Function to filter out objects where gameId is not "null"
const filterPlayersByGameId = (players) => {
    const filteredData = {};

  for (const outerKey in players) {
    if (Object.hasOwnProperty.call(players, outerKey)) {
      filteredData[outerKey] = {};
      for (const innerKey in players[outerKey]) {
        if (
          Object.hasOwnProperty.call(players[outerKey], innerKey) &&
          players[outerKey][innerKey].gameId === 'null'
        ) {
          filteredData[outerKey][innerKey] = players[outerKey][innerKey];
        }
      }
      // Check if the outer object has any inner objects left
      if (Object.keys(filteredData[outerKey]).length === 0) {
        delete filteredData[outerKey];
      }
    }
  }

  return filteredData;
};

// Function to check if all players are ready
const areAllPlayersReady = (players) => {
    const result = {};
    console.log(players)
    for (const key in players) {
        if (Object.hasOwnProperty.call(players, key)) {
            // Get the inner object
            const innerObject = players[key][Object.keys(players[key])[0]];

            // Add the inner object to the result with the top-level key
            result[key] = innerObject;
        }
    }
    console.log(result)
    if (Object.keys(result).length < 2) {
        console.log("Not enough players in lobby to start a game.")
        return false;
    }
    console.log(result)
    return Object.values(result).every((player) => player.isReady == true);
};

const createRoom = (currentPlayers) => {
    const result = {};

    // Create a new object with the same keys as mapBlockedSpaces
    // We need to decide coin/player positions before creating result object
    const blockedSpaces = {};
    const coinSpaces = {};

    for (const key in mapBlockedSpaces) {
        blockedSpaces[key] = true;
    }
    setCoinSpaces(blockedSpaces, coinSpaces)
    setPlayerPositions(blockedSpaces, currentPlayers)

    const currentPlayersDoubleNested = currentPlayers;
    // Loop through the top-level objects
    for (const key in currentPlayers) {
        if (Object.hasOwnProperty.call(currentPlayers, key)) {
            // Get the inner object
            const innerObject = currentPlayers[key][Object.keys(currentPlayers[key])[0]];

            // Add the inner object to the result with the top-level key
            result[key] = innerObject;
        }
    }
    currentPlayers = result;

    const gameObject = {
        players: currentPlayers,
        gameState: {
            gameReady: false,
            coins: coinSpaces,
            roundNumber: 1
        }
    }
    fetch(`${firebaseDatabaseURL}/games.json`, {
        method: "POST",
        body: JSON.stringify(gameObject),
        headers: {
            "Content-Type": "application/json",
        },
    })
        .then((response) => response.json())
        .then((data) => { // Game Id created
            console.log("Data written successfully:", data);
            //console.log(currentPlayers);
            for (const key in currentPlayers) {
                if (currentPlayers[key].hasOwnProperty("gameId")) {
                    currentPlayers[key].gameId = data.name;
                }
            }
            for (const key in currentPlayersDoubleNested) {
                for (const innerKey in currentPlayersDoubleNested[key]) {
                    if (currentPlayersDoubleNested[key][innerKey].hasOwnProperty("gameId")) {
                        currentPlayersDoubleNested[key][innerKey].gameId = data.name;
                    }
                }
            }

            const gameId = data.name
            fetch(`${firebaseDatabaseURL}/games/${gameId}/players.json`, {
                method: "POST",
                body: JSON.stringify(currentPlayers),
                headers: {
                    "Content-Type": "application/json",
                },
            }).then((response) => {
                if (!response.ok) {
                    console.log(response)
                    throw new Error('Network response was not ok');
                }
                return response.json(); // Parse the response JSON if applicable
            })
                .then((data) => {
                    // Handle the response data
                    fetch(`${firebaseDatabaseURL}/games/${gameId}/players/${data.name}.json`, {
                        method: "Delete",
                    }).then((response) => {
                        if (!response.ok) {
                            throw new Error('Network response was not ok');
                        }
                        console.log("delete successful")
                    })
                })
                .catch((error) => {
                    // Handle errors
                    console.error('Fetch error:', error);
                });

            fetch(`${firebaseDatabaseURL}/lobby.json`, {
                method: "PUT",
                body: JSON.stringify(currentPlayersDoubleNested),
                headers: {
                    "Content-Type": "application/json",
                },
            }).then((response) => {
                if (!response.ok) {
                    console.log(response)
                    throw new Error('Network response was not ok');
                }
                return response.json(); // Parse the response JSON if applicable
            })
                .then((data) => {
                    // Handle the response data
                    //console.log('Data updated:', data);
                    // Start monitoring game session
                    monitorActiveGame(gameId);
                })
                .catch((error) => {
                    // Handle errors
                    console.error('Fetch error:', error);
                });

        })
        .catch((error) => {
            console.error("Error writing data:", error);
        });
};

const setCoinSpaces = (blockedSpaces, coinPositions) => {
    for (let i = 0; i < 20; i++) {
        const position = getRandomPosition(blockedSpaces);
         // Add the selected position to the blocked spaces
        blockedSpaces[position] = true;
        coinPositions[position] = true;
    }
}

const setPlayerPositions = (blockedSpaces, currentPlayers) => {
    for (const key in currentPlayers) {
        const position = getRandomPosition(blockedSpaces);
        blockedSpaces[position] = true;
        const [xStr, yStr] = position.split("x"); // Split the position string into x and y parts
        const x = parseInt(xStr); // Convert the x part to an integer
        const y = parseInt(yStr);
        for (const innerKey in currentPlayers[key]) {
            if (currentPlayers[key][innerKey].hasOwnProperty("position")) {
                currentPlayers[key][innerKey].position.x = x;
                currentPlayers[key][innerKey].position.y = y;
            }
        }
    }
}

const createNewRound = (blockedSpaces, coinPositions, data) => {
    data.gameState.roundNumber += 1;

    for (let i = 0; i < 20; i++) {
        const position = getRandomPosition(blockedSpaces);
         // Add the selected position to the blocked spaces
        blockedSpaces[position] = true;
        coinPositions[position] = true;
    }

    for (const key in data.players) {
        const position = getRandomPosition(blockedSpaces);
        blockedSpaces[position] = true;
        const [xStr, yStr] = position.split("x"); // Split the position string into x and y parts
        const x = parseInt(xStr); // Convert the x part to an integer
        const y = parseInt(yStr);
      
        if (data.players[key].hasOwnProperty("position")) {
            data.players[key].position.x = x;
            data.players[key].position.y = y;
        }
    }
    data.gameState.coins = coinPositions;
}

// This will give you a free position not in mapBlockedSpaces
const getRandomPosition = (blockedSpaces) => {
    let x, y, position;

    do {
        // Generate random x and y within the given constraints
        x = Math.floor(Math.random() * (xPositionMaximum - xPositionMinimum + 1)) + xPositionMinimum;
        y = Math.floor(Math.random() * (yPositionMaximum - yPositionMinimum + 1)) + yPositionMinimum;

        // Create the position string
        position = `${x}x${y}`;
    } while (blockedSpaces[position]); // Repeat if the position is blocked

    return position;
}

// Maxes and mins inclusive
const xPositionMinimum = 1;
const xPositionMaximum = 13;
const yPositionMinimum = 4;
const yPositionMaximum = 11;
//CONST
const mapBlockedSpaces = {
    "1x11": true,
    "4x7": true,
    "5x7": true,
    "6x7": true,
    "7x4": true,
    "7x9": true,
    "8x6": true,
    "8x9": true,
    "9x6": true,
    "9x9": true,
    "10x6": true,
    "12x10": true
}

checkPlayersAndCreateRoom();
