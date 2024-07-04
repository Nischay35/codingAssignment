const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const app = express()
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const dbPath = path.join(__dirname, 'twitterClone.db')
app.use(express.json())
let db = null
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server running at 3000')
    })
  } catch (e) {
    console.log(`DB Error ${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()
const authenticatedToken = (request, response, next) => {
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
        next()
      }
    })
  }
}
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const getQuery = `select * from user where username='${username}';`
  const dbUser = await db.get(getQuery)
  if (dbUser === undefined) {
    const newUser = `insert into user (username,password,name,gender) values ('${username}','${hashedPassword}','${name}','${gender}');`
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      await db.run(newUser)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})
app.post('/login/', authenticatedToken, async (request, response) => {
  const {username, password} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const getQuery = `select * from user where username='${username}';`
  const dbUser = await db.get(getQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordTrue = await bcrypt.compare(password, dbUser.password)
    if (isPasswordTrue === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})
app.get('/user/tweets/feed/', authenticatedToken, async (request, response) => {
  const getQuery = `select username,tweet,datetime from tweet inner join follower on tweet.user_id=follower.following_user_id order by user_id desc limit 4;`
  const info = await db.get(getQuery)
  response.send(info)
})
app.get('/user/following/', authenticatedToken, async (request, response) => {
  const getQuery = `select name from user inner join follower on user.user_id=follower.following_user_id;`
  const info = await db.all(getQuery)
  response.send(info)
})
app.get('/user/followers/', authenticatedToken, async (request, response) => {
  const getQuery = `select name from user inner join follower on user.user_id=follower.follower_user_id;`
  const info = await db.all(getQuery)
  response.send(info)
})
app.get('/tweets/:tweetId/', authenticatedToken, async (request, response) => {
  const getQuery = `select * from tweet inner join follower on tweet.user_id=follower.following_user_id`
  const info = await db.get(getQuery)
  if (info === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const getQuery = `select tweet,count(like.like_id) as likes,count(reply.reply_id) as replies,date_time as dateTime from tweet inner join like on tweet.user_id=like.user_id inner join reply on like.user_id=reply.user_id order by user_id;`
    const data = await db.get(getQuery)
    response.send(data)
  }
})
app.get(
  '/tweets/:tweetId/likes/',
  authenticatedToken,
  async (request, response) => {
    const getQuery = `select * from tweet inner join follower on tweet.user_id=follower.following_user_id;`
    const info = await db.get(getQuery)
    if (info === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const getQuery = `select username as likes from user inner join like on user.user_id=like.user_id;`
      const data = await db.get(getQuery)
      response.send(data)
    }
  },
)
app.get(
  '/tweets/:tweetId/replies/',
  authenticatedToken,
  async (request, response) => {
    const getQuery = `select * from tweet inner join follower on tweet.user_id=follower.following_user_id;`
    const info = await db.get(getQuery)
    if (info === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const getQuery = `select name as name,reply as reply from user inner join reply on user.user_id=reply.user_id;`
      const data = await db.all(getQuery)
      response.send(data)
    }
  },
)
app.get('/user/tweets/', async (request, response) => {
  const getQuery = `select tweet,count(like.like_id) as likes,count(reply.reply_id) as replies,date_time as dateTime from tweet inner join like on tweet.user_id=like.user_id inner join reply on like.user_id=reply.user_id;`
  const data = await db.all(getQuery)
  response.send(data)
})
app.post('/user/tweets/', async (request, response) => {
  const tweetId = request.params
  const getPreviousTweet = `select * from tweet where tweet_id=${tweetId};`
  const previousTweet = await db.get(getPreviousTweet)
  const {
    tweet_id = previousTweet.tweet_id,
    tweet = previousTweet.tweet,
    user_id = previousTweet.user_id,
    date_time = previousTweet.date_time,
  } = request.body
  const getQuery = `insert into tweet (tweet_id,tweet,user_id,date_time) values (${tweet_id},'${tweet}',${user_id},'${date_time}');`
  await db.run(getQuery)
  response.send('Created a Tweet')
})
app.delete(
  '/tweets/:tweetId/',
  authenticatedToken,
  async (request, response) => {
    const getQuery = `select * from tweet inner join follower on tweet.user_id=follower.following_user_id;`
    const info = await db.get(getQuery)
    if (info === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const tweetId = request.params
      const deleteQuery = `delete from tweet where tweet_id=${tweetId};`
      await db.run(deleteQuery)
      response.send('Tweet Removed')
    }
  },
)
module.exports = app
