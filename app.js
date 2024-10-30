const express = require('express')
const sqlite3 = require('sqlite3')
const {open} = require('sqlite')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const format = require('date-fns/format')
const path = require('path')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server running at http://localhost:3000/')
    })
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

function authenticateToken(request, response, next) {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

//API 1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const checkUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(checkUserQuery)

  if (dbUser) {
    response.status(400).send('User already exists')
  } else if (password.length < 6) {
    response.status(400).send('Password is too short')
  } else {
    const createUserQuery = `
      INSERT INTO user (username, password, name, gender)
      VALUES ('${username}', '${hashedPassword}', '${name}', '${gender}')
    `
    await db.run(createUserQuery)
    response.status(200).send('User created successfully')
  }
})

//API 2 login
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(getUserQuery)

  if (!dbUser) {
    response.status(400).send('Invalid user')
  } else {
    const isPasswordValid = await bcrypt.compare(password, dbUser.password)
    if (!isPasswordValid) {
      response.status(400).send('Invalid password')
    } else {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    }
  }
})

//API 3 get lastest tweets
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserQuery = `SELECT user_id FROM user WHERE username = '${username}'`
  const dbUser = await db.get(getUserQuery)

  const getTweetsQuery = `
    SELECT username, tweet, date_time AS dateTime 
    FROM tweet 
    INNER JOIN user ON tweet.user_id = user.user_id 
    WHERE tweet.user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id = ${dbUser.user_id})
    ORDER BY date_time DESC LIMIT 4
  `
  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

//API 4 following
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserQuery = `SELECT user_id FROM user WHERE username = '${username}'`
  const dbUser = await db.get(getUserQuery)

  const getFollowingQuery = `
    SELECT name FROM user 
    INNER JOIN follower ON user.user_id = follower.following_user_id 
    WHERE follower.follower_user_id = ${dbUser.user_id}
  `
  const following = await db.all(getFollowingQuery)
  response.send(following)
})

//API 5 followers
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserQuery = `SELECT user_id FROM user WHERE username = '${username}'`
  const dbUser = await db.get(getUserQuery)

  const getFollowersQuery = `
    SELECT name FROM user 
    INNER JOIN follower ON user.user_id = follower.follower_user_id 
    WHERE follower.following_user_id = ${dbUser.user_id}
  `
  const followers = await db.all(getFollowersQuery)
  response.send(followers)
})

//API 6 tweet details
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  try {
    const {username} = request
    const {tweetId} = request.params

    const getUserQuery = `SELECT user_id FROM user WHERE username = '${username}'`
    const dbUser = await db.get(getUserQuery)

    const getTweetQuery = `
    SELECT * FROM follower
    WHERE follower_user_id = ${dbUser.user_id} AND following_user_id = (SELECT user_id FROM tweet WHERE tweet_id = ${tweetId});
  `

    const tweetDetails = await db.get(getTweetQuery)

    if (!tweetDetails) {
      response.status(401).send('Invalid Request')
    } else {
      response.send(tweetDetails)
    }
  } catch (error) {
    response.status(500).send('Server Error')
  }
})

//API 7 likes
app.get(
  '/tweets/:tweetId/likes',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request

    const userQuery = `SELECT user_id FROM user WHERE username = '${username}'`
    const user = await db.get(userQuery)

    const followingTweetQuery = `
    SELECT * FROM follower
    WHERE follower_user_id = ${user.user_id} AND following_user_id = (SELECT user_id FROM tweet WHERE tweet_id = ${tweetId});
  `
    const followingTweet = await db.get(followingTweetQuery)

    if (followingTweet === undefined) {
      response.status(401).send('Invalid Request')
    } else {
      response.send({likes: likes.map(user => user.username)})
    }
  },
)

//API 8 replies
app.get(
  '/tweets/:tweetId/replies',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request

    const userQuery = `SELECT user_id FROM user WHERE username = '${username}'`
    const user = await db.get(userQuery)

    const followingTweetQuery = `
    SELECT * FROM follower
    WHERE follower_user_id = ${user.user_id} AND following_user_id = (SELECT user_id FROM tweet WHERE tweet_id = ${tweetId});
  `
    const followingTweet = await db.get(followingTweetQuery)

    if (followingTweet === undefined) {
      response.status(401).send('Invalid Request')
    } else {
      response.send({replies})
    }
  },
)

//API 9 all tweets
app.get('/user/tweets', authenticateToken, async (request, response) => {
  const {username} = request

  const userQuery = `SELECT user_id FROM user WHERE username = '${username}'`
  const user = await db.get(userQuery)

  const tweetsQuery = `
    SELECT tweet, 
           COUNT(DISTINCT like.like_id) AS likes, 
           COUNT(DISTINCT reply.reply_id) AS replies, 
           tweet.date_time AS dateTime
    FROM tweet 
    LEFT JOIN like ON tweet.tweet_id = like.tweet_id 
    LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id 
    WHERE tweet.user_id = ${user.user_id}
    GROUP BY tweet.tweet_id
  `
  const tweets = await db.all(tweetsQuery)
  response.send(tweets)
})

//API 10 create a tweet
app.post('/user/tweets', authenticateToken, async (request, response) => {
  const {username} = request
  const {tweet} = request.body

  const userQuery = `SELECT user_id FROM user WHERE username = '${username}'`
  const user = await db.get(userQuery)

  const currentDate = format(new Date(), 'yyyy-MM-dd HH:mm:ss')

  const createTweetQuery = `
    INSERT INTO tweet (tweet, user_id, date_time)
    VALUES ('${tweet}', ${user.user_id}, '${currentDate}')
  `
  await db.run(createTweetQuery)
  response.status(201).send('Created a Tweet')
})

//API 11 delete
app.delete('/tweets/:tweetId', authenticateToken, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request

  const userQuery = `SELECT user_id FROM user WHERE username = '${username}'`
  const user = await db.get(userQuery)

  const tweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId}`
  const tweet = await db.get(tweetQuery)

  if (tweet === undefined) {
    response.status(404).send('Tweet not found')
  } else if (tweet.user_id !== user.user_id) {
    response.status(401).send('Invalid Request')
  } else {
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId}`
    await db.run(deleteTweetQuery)
    response.send('Tweet Removed')
  }
})

module.exports = app
