/* eslint-disable no-useless-catch */
import Wikicite, { debug } from "./wikicite";
import Wikidata, { CitesWorkClaim } from "./wikidata";
import ItemWrapper from "./itemWrapper";
import SourceItemWrapper from "./sourceItemWrapper";
import Matcher from "./matcher";
import OCI, { OCIPIDType } from "../oci";
import Progress from "./progress";
import { EntityId } from "wikibase-sdk";

/** Class representing a citation */
class Citation {
	source: SourceItemWrapper;
	target: ItemWrapper;
	ocis: {
		citingId: string;
		citedId: string;
		idType: OCIPIDType;
		oci: string;
		supplierName: string;
		valid: boolean;
	}[];
	readonly uuid: string;

	/**
	 * Create a citation.
	 * @param {Object} citation - A Citation literal.
	 * @param {Zotero.Item} citation.item - The citation's target item literal.
	 * @param {string} citation.item.key - The citation's target item key, if linked to
	 *   an item in the library.
	 * @param {Array} ocis - Array of OpenCitations OCIs.
	 *   this citation.
	 * @param {Zotero.Item} sourceItem - The citation's source item.
	 */
	constructor(
		{
			item,
			ocis,
			zotero,
		}: {
			item:
				| Zotero.Item
				| {
						itemType?: // there are all possible itemTypes for Zotero.Item(itemType)
						| keyof Zotero.Item.ItemTypeMapping
							| Zotero.Item.ItemTypeMapping[keyof Zotero.Item.ItemTypeMapping];
						// eslint-disable-next-line no-mixed-spaces-and-tabs
				  };
			ocis: string[];
			zotero?: string;
		},
		// index,  // knowing the index in the citationList may be important
		sourceItem: SourceItemWrapper, // should the parent CitationList (with its source item and methods to save) be passed instead?
	) {
		// Fixme: improve type checking of the citation object passed as argument
		if (!item || !ocis) {
			throw new Error("Missing item, OCIs, or Zotero key fields!");
		}

		// this.index = index;
		this.source = sourceItem;

		if (item instanceof Zotero.Item) {
			this.target = new ItemWrapper(
				item,
				this.source.saveCitations.bind(this.source),
			);
		} else {
			if (!item.itemType) {
				// use a default item type if it was not provided in the target item literal
				// fix: move this default value out to another file or module
				item.itemType = "journalArticle";
			}
			this.target = new ItemWrapper(
				new Zotero.Item(item.itemType),
				this.source.saveCitations.bind(this.source),
			);
			this.target.fromJSON(item);
		}

		this.ocis = [];
		ocis.forEach((oci) => this.addOCI(oci));

		this.target.key = zotero;
		// if a Zotero item key is provided for the target item,
		// and the target item is a Zotero Item (not a raw citation)
		// then automatically link the source and target items
		if (zotero && item instanceof Zotero.Item) {
			this.linkToZoteroItem(item);
		}

		// Issue: Save and upload information about citations order
		// this.series_ordinal;
		// // crosref does provide a citation key which seems to have some ordinal information
		// // but I say to leave this out for now

		// generate a unique identifier for this citation
		this.uuid = crypto.randomUUID();
	}

	addCreator(creatorType: any, creatorName: string) {
		// I may limit author types to author and editor
	}

	addOCI(oci: string) {
		const { citingId, citedId, idType, supplier } = OCI.parseOci(oci);

		// commented out because not really needed (yet) and was causing
		// that pids could not be cleared, because they would be refilled
		// when addOCI was invoked from the constructor
		// // if source or target items do not have pid of type idType,
		// // use the one derived from the oci provided
		// if (!this.source[idType]) this.source[idType] = citingId;
		// if (!this.target[idType]) this.target[idType] = citedId;

		// recalculate OCI and compare against OCI given
		let newOci = "";
		try {
			newOci = OCI.getOci(
				supplier,
				this.source.getPID(idType)!.id,
				this.target.getPID(idType)!.id,
			);
		} catch {
			//
		}
		const valid = oci == newOci;

		// overwrite pre-existing oci of the same supplier
		if (this.getOCI(supplier)) {
			debug("Overwriting OCI of supplier " + supplier);
			this.removeOCI(supplier);
		}

		this.ocis.push({
			citingId: citingId!,
			citedId: citedId!,
			idType: idType,
			oci: oci,
			supplierName: supplier,
			valid: valid,
		});
	}

	/*
	 * Delete citation from Wikidata
	 */
	async deleteRemotely() {
		let success;
		const wikidataOci = this.getOCI("wikidata");
		if (wikidataOci && wikidataOci.valid) {
			try {
				const qid = this.source.qid;
				if (qid === undefined) {
					throw new Error(
						"Can't delete citation from Wikidata for item without QID.",
					);
				}
				// fetch cites work statements
				const claims = await Wikidata.getCitesWorkClaims(
					qid as EntityId, // EntityID is a wikidata id, starting with Q, L, P, or M
				);
				const pushClaims = {
					qid: claims[qid].reduce(
						(claimsToRemove: CitesWorkClaim[], claim) => {
							// claim could be a string, number of actual claim object
							// keep those which want to be deleted
							if (
								typeof claim != "string" &&
								typeof claim != "number" &&
								claim.value === this.target.qid
							) {
								// create CitesWorkClaim objects from them
								const pushClaim = new CitesWorkClaim(claim);
								// and update them to pending remove status
								pushClaim.remove = true;
								claimsToRemove.push(pushClaim);
							}
							return claimsToRemove;
						},
						[],
					),
				};
				// pass them to updateCitesWorkClaims to upload changes
				const results =
					await Wikidata.updateCitesWorkClaims(pushClaims);
				success = Object.values(results).every(
					(result) => result === "ok",
				);
			} catch (err) {
				// fail if citation could not be deleted remotely
				// do not fail if it couldn't be deleted because it doesn't exist
				throw err;
			}
		} else {
			// fix: better handle this. Do I have a debugger?
			// Located string in a console message?
			throw new Error(
				"Cannot sync deletion of citation not available in Wikidata.",
			);
		}
		return success;
	}

	getOCI(supplierName: string) {
		const ocis = this.ocis.filter(
			(oci) => oci.supplierName === supplierName,
		);
		if (ocis.length > 1) {
			throw new Error(
				"Unexpected multiple OCIs for supplier " + supplierName,
			);
		}
		return ocis[0];
	}

	removeOCI(supplierName: string) {
		this.ocis = this.ocis.filter(
			(oci) => oci.supplierName !== supplierName,
		);
	}

	/**
	 * Return a JSON object to save to the source item extra field.
	 */
	toJSON() {
		// const item = this.target.item.toJSON();
		// delete item.version;
		// delete item.tags;
		// delete item.collections;
		// delete item.relations;

		return {
			// item: item,
			item: this.target.toJSON(),
			ocis: this.ocis.map((oci) => oci.oci),
			zotero: this.target.key,
		};
	}

	sync() {
		// upload this and only this citation to wikidata
		// check if both this.sourceItem and this.item have qid
		// do not proceed if this.suppliers includes wikidata already
		// use Wikidata.getCitations(this.sourceItem) to see if it's already uploaded
		// if not, use Wikidata.addCitation(this.sourceItem.qid, this.item.qid)
		// add wikidata to this.suppliers
		// how do I save changes to sourceItem extra field now?
		// I need access to the parent CitationList
	}

	/**
	 * Automatically link citation with matching Zotero item
	 * @param {Object} [matcher] Initialized Matcher object for batch operations
	 */
	async autoLink(matcher?: Matcher) {
		let manual = false;
		let progress;
		if (!matcher) {
			// If a Matcher object was not provided, create a new one
			matcher = new Matcher(this.source.item.libraryID);
			// Only in this case, be verbose
			progress = new Progress(
				"loading",
				Wikicite.getString(
					"wikicite.citation.auto-link.progress.loading",
				),
			);
			await matcher.init();
			manual = true;
		}
		const matches = matcher.findMatches(this.target.item);
		let item: Zotero.Item | undefined;
		if (matches.length) {
			// Automatic linking succeeded
			if (progress)
				progress.updateLine(
					"done",
					Wikicite.getString(
						"wikicite.citation.auto-link.progress.success",
					),
				);
			// if multiple matches, use first one
			item = Zotero.Items.get(matches[0]);
		} else if (manual) {
			// Automatic linking failed: select manually
			if (progress)
				progress.updateLine(
					"error",
					Wikicite.getString(
						"wikicite.citation.auto-link.progress.failure",
					),
				);
			const result = Services.prompt.confirm(
				window as mozIDOMWindowProxy,
				Wikicite.getString("wikicite.citation.auto-link.failure.title"),
				Wikicite.getString(
					"wikicite.citation.auto-link.failure.message",
				),
			);
			if (result) item = Wikicite.selectItem()!;

			// ignore selection if another citation already links to the same item
			if (
				item &&
				this.source.citations.some(
					(citation) => citation.target.key === item?.key,
				)
			) {
				Services.prompt.alert(
					window as mozIDOMWindowProxy,
					"",
					Wikicite.getString(
						"wikicite.citation.link.error.duplicate",
					),
				);
				item = undefined;
			}
		}
		if (progress) progress.close();
		if (item) {
			this.linkToZoteroItem(item);
		}
	}

	// link the citation target item to an item in the zotero library
	linkToZoteroItem(item: Zotero.Item) {
		if (item === this.source.item) {
			Services.prompt.alert(
				window as mozIDOMWindowProxy,
				"",
				Wikicite.getString("wikicite.citation.link.error.source-item"),
			);
			return;
		}

		if (item.libraryID && item.libraryID !== this.source.item.libraryID) {
			Services.prompt.alert(
				window as mozIDOMWindowProxy,
				"",
				Wikicite.getString("wikicite.citation.link.error.library"),
			);
			return;
		}

		// this.source.newRelations ||= this.source.item.addRelatedItem(item);
		this.source.newRelations =
			this.source.item.addRelatedItem(item) || this.source.newRelations;
		if (item.addRelatedItem(this.source.item)) {
			item.saveTx({
				skipDateModifiedUpdate: true,
			});
		}

		this.target.key = item.key;
		this.source.saveCitations();
	}

	async unlinkFromZoteroItem(autosave = true) {
		// other citations link to the same item
		const otherLinks = this.source.citations.some(
			(citation) =>
				citation !== this && citation.target.key === this.target.key,
		);
		const linkedItem = Zotero.Items.getByLibraryAndKey(
			this.source.item.libraryID,
			this.target.key!,
		) as Zotero.Item;
		if (!otherLinks) {
			this.source.newRelations =
				(await this.source.item.removeRelatedItem(linkedItem)) ||
				this.source.newRelations;
			if (await linkedItem.removeRelatedItem(this.source.item)) {
				linkedItem.saveTx({
					skipDateModifiedUpdate: true,
				});
			}
		}
		this.target.key = undefined;
		if (autosave) this.source.saveCitations();
	}

	resolveOCI(supplierName: string) {
		const oci = this.getOCI(supplierName);
		OCI.resolve(oci.oci);
	}
}

export default Citation;
