var request = require("request");
var fs = require("fs");
//require("request-debug")(request);

var argv = require("yargs")
			.alias("u", "user")
			.alias("f", "file")
			.argv;


var username = argv.user;

var apiBase = "http://pr0gramm.com/api/";

var stats = {
	comments: {
		up: 0,
		down: 0,
		averageLength: 0,
		count: 0,
		worst: { id: 0, itemId: 0, up: 0, down: 0, content: null, thumb: null },
		best: { id: 0, itemId: 0, up: 0, down: 0, content: null, thumb: null },
		upPattern: "",
		downPattern: "",
		totalPattern: "",
		raw: null
	},
	uploads: {
		up: 0,
		down: 0,
		count: 0,
		worst: { id: 0, up: 0, down: 0, thumb: null },
		best: { id: 0, up: 0, down: 0, thumb: null },
		upPattern: "",
		downPattern: "",
		totalPattern: "",
		raw: null
	},
	tags: {
		total: 0,
		count: 0
	},
	user: {
	},
	badges: [
	]
};

function getBenis(user, cb)
{
	apiCall("profile/info", { name: user, flags: 7 }, function(err, res) {
		if(err)
			return cb(err, null);
		cleanResponse(res, [ "uploads", "comments", "likes", "following" ]);
		cb(null, res);
	});
}

function cleanResponse(res, removals)
{
	for(var i = 0; i < removals.length; ++i)
		delete res[removals[i]];
}
function getCommentsAfter(user, unix, cb)
{
	apiCall("profile/comments",  {
		name: user,
		after: unix
	}, cb);
}

function fetchComments(user, cb, ts, comments)
{
	ts = ts || 1;
	comments = comments || [];

	getCommentsAfter(user, ts, function(err, res) {
		if(err)
			return cb(err, null);

		for(var i = 0; i < res.comments.length; ++i)
			comments.push(res.comments[i]);

		if(res.hasNewer)
		{
			var newestComment = res.comments[res.comments.length - 1] || { created: "1" };
			fetchComments(user, cb, newestComment.created, comments);
		}
		else
		{
			cb(null, comments);
		}
	});
}

function getUploadsOlder(user, unix, cb)
{
	var obj = {
		user: user,
		flags: 7
	};

	if(unix != 0)
	{
		obj.older = unix;
	}
	apiCall("items/get", obj, cb);
}

function fetchUploads(user, cb, id, uploads)
{
	id = id || 0;
	uploads = uploads || [];

	getUploadsOlder(user, id, function(err, res) {
		if(err)
			return cb(err, null);

		for(var i = 0; i < res.items.length; ++i)
			uploads.push(res.items[i]);

		if(!res.atEnd && res.items.length > 0)
		{
			var oldestUpload = res.items[res.items.length - 1] || { id: 1 };
			fetchUploads(user, cb, oldestUpload.id, uploads);
		}
		else
		{
			uploads.reverse();
			cb(null, uploads);
		}
	});
}


function apiCall(method, qs, cb)
{
	cb = (cb || function() {});
	method = method || "";
	qs = qs || {};
	request.get({
		url: apiBase + method,
		qs: qs,
		json: true
	}, function (error, response, body) {
		if(!!error)
			cb(err, null);
		else
		{
			cleanResponse(body, ["ts", "cache", "rt", "qc"]);
			cb(null, body);
		}
	});
}

function addDynamicBadges(profileData)
{
	var d = profileData;
	var commentBadge = null;
	var yearBadge = null;

	if(d.commentCount > 1000)
	{
		commentBadge = {
			link: null,
			image: "comments.png",
			cssClass: "pr0gramm-badge-comments"
		};

		var n = 1000;
		if(d.commentCount > 5000)
		{
			n = 5000;
			if(d.commentCount > 10000)
			{
				n = 10000;
			}
		}
		commentBadge.description = "Hat mehr als " + n + " Kommentare verfasst";
		commentBadge.extra = (n / 1000) + "k";
	}

	var now = unixTime();
	var active = now - d.user.registered;
	var oneYear = 60 * 60 * 24 * 365;
	var yearsActive = Math.floor(active / oneYear);
	if(yearsActive > 0)
	{
		yearBadge = {
			link: null,
			image: "years.png",
			description: "Hat " + yearsActive + " Jahre auf pr0gramm verschwendet",
			extra: yearsActive,
			cssClass: "pr0gramm-badge-years"
		};
	}

	var badges = d.badges;
	if(commentBadge)
		badges.push(commentBadge);
	if(yearBadge)
		badges.push(yearBadge);

	return badges;
}

function unixTime() {
	return Math.floor(Date.now() / 1000);
}

getBenis(username, function(err, profileData) {
	stats.user = profileData.user;
	stats.badges = addDynamicBadges(profileData);

	console.log("Fetching stats for %s", profileData.user.name);

	console.log("Fetching comments...");
	fetchComments(username, function(err, comments) {

		clearCommentStats(stats);

		if(!err)
			gatherCommentStats(comments, stats);

		console.log("Fetching uploads...");
		fetchUploads(username, function(err, uploads) {
			clearUploadStats(stats);
			if(!err)
				gatherUploadStats(uploads, stats);

			gatherTagStats(profileData, stats);

			var uploadBenis = stats.uploads.up - stats.uploads.down;
			var commentBenis = stats.comments.up - stats.comments.down;
			var totalBenis = profileData.user.score;

			console.log();
			console.log("Total Benis: %d", totalBenis);
			console.log();
			console.log("Uploads: %d", stats.uploads.count);
			console.log("Benis für Uploads:");
			console.log("\t%d (%d% von total)", uploadBenis, (uploadBenis / totalBenis * 100).toFixed(2));
			console.log("\t\t%d up", stats.uploads.up);
			console.log("\t\t%d down", stats.uploads.down);
			console.log("\t%d Benis/Upload", (uploadBenis / stats.uploads.count).toFixed(2));

			console.log("Kommentare: %d", stats.comments.count);
			console.log("Benis für Kommentare:");
			console.log("\t%d (%d% von total)", commentBenis, (commentBenis / totalBenis * 100).toFixed(2));
			console.log("\t\t%d up", stats.comments.up);
			console.log("\t\t%d down", stats.comments.down);
			console.log("\t%d Benis/Kommentar", (commentBenis / stats.comments.count).toFixed(2));
			console.log("Durchschnittliche Kommentarlänge: %d", stats.comments.averageLength.toFixed(2));

			console.log("Tags: %d", stats.tags.count);
			console.log("Benis für Tags:");
			console.log("\t%d (%d% von total)", stats.tags.total, (stats.tags.total / totalBenis * 100).toFixed(2));
			console.log("\t%d Benis/Tag", (stats.tags.total / stats.comments.count).toFixed(2));

			var now = unixTime();
			var delta = now - profileData.user.registered;

			var benisPerSecond = totalBenis / delta;
			var benisPerMinute = benisPerSecond * 60;
			var benisPerHour = benisPerMinute * 60;
			var benisPerDay = benisPerHour * 24;

			console.log("Benis/Sekunde: %d (%d µBenis/Sekunde)", benisPerSecond.toFixed(6), (benisPerSecond * 1000000).toFixed(2));
			console.log("Benis/Minute: %d (%d µBenis/Minute)", benisPerMinute.toFixed(6), (benisPerMinute * 1000000).toFixed(2));
			console.log("Benis/Stunde: %d", benisPerHour.toFixed(6));
			console.log("Benis/Tag: %d", benisPerDay.toFixed(6));

			var fileName = argv.file || null;
			if(fileName)
			{
				console.log("Writing stats as JSON file to \"%s\"", fileName);
				fs.writeFileSync(fileName, JSON.stringify(stats, null, 4));
			}
		});
	});
});

function clearCommonStats(s, statname)
{
	s[statname].raw = null;
	s[statname].up = 0;
	s[statname].down = 0;
	s[statname].count = 0;
	s[statname].upPattern = "";
	s[statname].downPattern = "";
	s[statname].totalPattern = "";
}

function clearUploadStats(s)
{
	clearCommonStats(s, "uploads");
}

function gatherTagStats(profileData, s)
{
	var commentTotal = s.comments.up - s.comments.down;
	var uploadTotal = s.uploads.up - s.uploads.down;

	s.tags.total = profileData.user.score - (commentTotal + uploadTotal);
	s.tags.count = profileData.tagCount;
}

function gatherUploadStats(uploads, s)
{
	var best = null;
	var worst = null;

	for(var i = 0; i < uploads.length; ++i)
	{
		var u = uploads[i];
		var uup = parseInt(u.up);
		var udown = parseInt(u.down);
		var uploadScore = uup - udown;

		if(best == null || uploadScore > (best.up - best.down))
		{
			best = { id: u.id, up: uup, down: udown, thumb: u.thumb};
		}
		if(worst == null || uploadScore < (worst.up - worst.down))
		{
			worst = { id: u.id, up: uup, down: udown, thumb: u.thumb};
		}

		s.uploads.upPattern += uup + " ";
		s.uploads.downPattern += udown + " ";
		s.uploads.totalPattern += uploadScore.toString() + " ";
		s.uploads.up += uup;
		s.uploads.down += udown;
	}
	s.uploads.best = best;
	s.uploads.worst = worst;
	s.uploads.count = uploads.length;
	s.uploads.upPattern = s.uploads.upPattern.slice(0, -1);
	s.uploads.downPattern = s.uploads.downPattern.slice(0, -1);
	s.uploads.totalPattern = s.uploads.totalPattern.slice(0, -1);
}

function clearCommentStats(s)
{
	clearCommonStats(s, "comments");
	s.comments.averageLength = 0;
}

function gatherCommentStats(comments, s)
{
	var lengthSum = 0;
	var best = null;
	var worst = null;

	for(var i = 0; i < comments.length; ++i)
	{
		var c = comments[i];
		var cup = parseInt(c.up);
		var cdown = parseInt(c.down);
		var commentScore = cup - cdown;

		if(best == null || commentScore > (best.up - best.down))
		{
			best = { id: c.id, itemId: c.itemId, up: cup, down: cdown, content: c.content, thumb: c.thumb};
		}
		if(worst == null || commentScore < (worst.up - worst.down))
		{
			worst = { id: c.id, itemId: c.itemId, up: cup, down: cdown, content: c.content, thumb: c.thumb};
		}

		s.comments.upPattern += cup + " ";
		s.comments.downPattern += cdown + " ";
		s.comments.totalPattern += (cup - cdown).toString() + " ";
		s.comments.up += cup;
		s.comments.down += cdown;
		lengthSum += (c.content || "").length;
	}

	s.comments.best = best;
	s.comments.worst = worst;
	s.comments.count = comments.length;
	s.comments.averageLength = lengthSum / comments.length;
	s.comments.upPattern = s.comments.upPattern.slice(0, -1);
	s.comments.downPattern = s.comments.downPattern.slice(0, -1);
	s.comments.totalPattern = s.comments.totalPattern.slice(0, -1);
}
