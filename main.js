const firebaseDatabaseURL = "https://multiplayer-demo-2f287-default-rtdb.firebaseio.com";
const playersPath = "lobby.json"; // Path to players data
const gamesPath = "games.json"; // Path to games data

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const checkPlayersAndCreateRoom = async () => {
    while (true) {
        try {
            const response = await fetch(`${firebaseDatabaseURL}/${playersPath}`);
            const data = await response.json();
            // Filter out objects where gameId is not "null"
            const filteredData = filterPlayersByGameId(data);

            if (areAllPlayersReady(filteredData)) {
                createRoom(filteredData);
                //break; // Exit the loop once a room is created
                await delay(10000);
            } else {
                console.log("Not all players are ready. Waiting...");
            }

            await delay(5000); // Wait for 1 second before checking again
        } catch (error) {
            console.error("Error reading data:", error);
            await delay(5000); // Wait for 1 second before retrying after an error
        }
    }
};

//ADD LOGIC FOR LAST UPDATE 
const monitorActiveGame = async (gameId) => {
    while (true) {
        try {
            const response = await fetch(`${firebaseDatabaseURL}/games/${gameId}.json`);
            const data = await response.json();
            let isUpdated = false;

            for (const playerId in data.players) {
                if (data.players.hasOwnProperty(playerId)) {
                  const player = data.players[playerId];
                  
                  console.log(player.position)
                  if (data.gameState.coins[`${player.position.x}x${player.position.y}`]) {
                    console.log(`Player named ${player.name} grabbed coin at position (${player.position.x},${player.position.y})`);
                    delete data.gameState.coins[`${player.position.x}x${player.position.y}`];
                    data.players[playerId].coins += 1;
                    isUpdated = true;
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

            await delay(33); // Check player postions about 30 times a second
        } catch (error) {
            console.error("Error reading data:", error);
            await delay(5000); // Wait for 1 second before retrying after an error
        }
    }
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
            coins: coinSpaces
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
