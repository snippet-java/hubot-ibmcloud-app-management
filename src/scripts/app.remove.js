// Description:
//	Listens for commands to initiate actions against Bluemix
//
// Configuration:
//	 HUBOT_BLUEMIX_API Bluemix API URL
//	 HUBOT_BLUEMIX_ORG Bluemix Organization
//	 HUBOT_BLUEMIX_SPACE Bluemix space
//	 HUBOT_BLUEMIX_USER Bluemix User ID
//	 HUBOT_BLUEMIX_PASSWORD Password for the Bluemix User
//
// Author:
//	nsandona
//
/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const path = require('path');
const TAG = path.basename(__filename);

const cf = require('hubot-cf-convenience');
const utils = require('hubot-ibmcloud-utils').utils;
const activity = require('hubot-ibmcloud-activity-emitter');
const Conversation = require('hubot-conversation');
const entities = require('../lib/app.entities');

// --------------------------------------------------------------
// i18n (internationalization)
// It will read from a peer messages.json file.  Later, these
// messages can be referenced throughout the module.
// --------------------------------------------------------------
const i18n = new (require('i18n-2'))({
	locales: ['en'],
	extension: '.json',
	// Add more languages to the list of locales when the files are created.
	directory: __dirname + '/../messages',
	defaultLocale: 'en',
	// Prevent messages file from being overwritten in error conditions (like poor JSON).
	updateFiles: false
});
// At some point we need to toggle this setting based on some user input.
i18n.setLocale('en');

const REMOVE = /app\s(remove|delete|destroy)\s+(.*)/i;

module.exports = (robot) => {

	// Register entity handling functions
	entities.registerEntityFunctions();

	let switchBoard = new Conversation(robot);

	// Natural Language match
	robot.on('bluemix.app.remove', (res, parameters) => {
		robot.logger.debug(`${TAG}: bluemix.app.remove - Natural Language match - res.message.text=${res.message.text}.`);
		if (parameters && parameters.appname) {
			processAppRemove(robot, res, parameters.appname);
		}
		else {
			robot.logger.error(`${TAG}: Error extracting App Name from text [${res.message.text}].`);
			let message = i18n.__('cognitive.parse.problem.remove');
			robot.emit('ibmcloud.formatter', { response: res, message: message});
		}
	});

	// RegEx match
	robot.respond(REMOVE, {id: 'bluemix.app.remove'}, (res) => {
		robot.logger.debug(`${TAG}: bluemix.app.remove - RegEx match - res.message.text=${res.message.text}.`);
		processAppRemove(robot, res, res.match[2]);
	});


	function processAppRemove(robot, res, name){
		let appGuid;
		const activeSpace = cf.activeSpace(robot, res);

		robot.logger.info(`${TAG}: Destroying application ${name} in space ${activeSpace.name}.`);
		let prompt = i18n.__('app.remove.prompt', name);
		let negativeResponse = i18n.__('general.safe.this.time', name);
		utils.getConfirmedResponse(res, switchBoard, prompt, negativeResponse).then((result) => {
			// destroy the app
			robot.logger.info(`${TAG}: Confirming destruction of ${name} in space ${activeSpace.name}.`);
			let message = i18n.__('app.remove.in.progress', name, cf.activeSpace().name);
			robot.emit('ibmcloud.formatter', { response: res, message: message});

			robot.logger.info(`${TAG}: Asynch call using cf library to obtain app information for ${name} in space ${activeSpace.name}.`);
			cf.Apps.getApp(name, activeSpace.guid).then((result) => {
				if (!result) {
					robot.logger.error(`${TAG}: No application named ${name} was found in space ${activeSpace.name}.`);
					return Promise.reject(i18n.__('app.general.not.found', name, cf.activeSpace().name));
				}
				appGuid = result.metadata.guid;
				robot.logger.info(`${TAG}: Asynch call using cf library to remove app ${name} in space ${activeSpace.name}.`);
				return cf.Apps.remove(appGuid);
			}).then(() => {
				robot.logger.info(`${TAG}: Removal of app ${name} in space ${activeSpace.name} was successful.`);
				let message = i18n.__('app.remove.success', name);
				robot.emit('ibmcloud.formatter', { response: res, message: message});
				activity.emitBotActivity(robot, res, {
					activity_id: 'activity.app.remove',
					app_name: name,
					app_guid: appGuid,
					space_name: activeSpace.name,
					space_guid: activeSpace.guid
				});
			}, (response) => {
				robot.logger.error(`${TAG}: Removal of app ${name} in space ${activeSpace.name} failed.`);
				robot.logger.error(response);
				let message = i18n.__('app.remove.failure', name, response);
				robot.emit('ibmcloud.formatter', { response: res, message: message});
			});
		});
	};
};
