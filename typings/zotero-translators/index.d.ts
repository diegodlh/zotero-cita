// File copied from https://github.com/zotero/translators/blob/master/index.d.ts
// seeAlso, notes and attachments made optional; Utilities namespace removed

declare namespace ZoteroTranslators {
	interface Attachment {
		title: string;
		snapshot?: boolean;
		mimeType?: string;
		url?: string;
		document?: Document;
		path?: string;
		proxy?: boolean;
	}

	interface Tag {
		tag: string;
	}

	type ItemType = keyof ItemTypes;

	/**
	 * Generic item with unknown type.
	 */
	type Item = ItemTypes[ItemType];

	let Item: {
		new <T extends ItemType>(itemType: T): ItemTypes[T];
		new (itemType: string): Item;
	};

	interface Creator<T extends CreatorType> {
		lastName: string?;
		firstName: string?;
		creatorType: T;
		fieldMode: 1?;
	}

	/* *** BEGIN GENERATED TYPES *** */
	type ItemTypes = {
		artwork: ArtworkItem;
		audioRecording: AudioRecordingItem;
		bill: BillItem;
		blogPost: BlogPostItem;
		book: BookItem;
		bookSection: BookSectionItem;
		case: CaseItem;
		computerProgram: ComputerProgramItem;
		conferencePaper: ConferencePaperItem;
		dataset: DatasetItem;
		dictionaryEntry: DictionaryEntryItem;
		document: DocumentItem;
		email: EmailItem;
		encyclopediaArticle: EncyclopediaArticleItem;
		film: FilmItem;
		forumPost: ForumPostItem;
		hearing: HearingItem;
		instantMessage: InstantMessageItem;
		interview: InterviewItem;
		journalArticle: JournalArticleItem;
		letter: LetterItem;
		magazineArticle: MagazineArticleItem;
		manuscript: ManuscriptItem;
		map: MapItem;
		newspaperArticle: NewspaperArticleItem;
		patent: PatentItem;
		podcast: PodcastItem;
		preprint: PreprintItem;
		presentation: PresentationItem;
		radioBroadcast: RadioBroadcastItem;
		report: ReportItem;
		standard: StandardItem;
		statute: StatuteItem;
		thesis: ThesisItem;
		tvBroadcast: TVBroadcastItem;
		videoRecording: VideoRecordingItem;
		webpage: WebpageItem;
	};

	type ArtworkItem = {
		itemType: "artwork";
		title?: string;
		abstractNote?: string;
		artworkMedium?: string;
		artworkSize?: string;
		date?: string;
		language?: string;
		shortTitle?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		url?: string;
		accessDate?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"artist" | "contributor">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type AudioRecordingItem = {
		itemType: "audioRecording";
		title?: string;
		abstractNote?: string;
		audioRecordingFormat?: string;
		seriesTitle?: string;
		volume?: string;
		numberOfVolumes?: string;
		place?: string;
		label?: string;
		date?: string;
		runningTime?: string;
		language?: string;
		ISBN?: string;
		shortTitle?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		url?: string;
		accessDate?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			"performer" | "contributor" | "composer" | "wordsBy"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type BillItem = {
		itemType: "bill";
		title?: string;
		abstractNote?: string;
		billNumber?: string;
		code?: string;
		codeVolume?: string;
		section?: string;
		codePages?: string;
		legislativeBody?: string;
		session?: string;
		history?: string;
		date?: string;
		language?: string;
		url?: string;
		accessDate?: string;
		shortTitle?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"sponsor" | "cosponsor" | "contributor">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type BlogPostItem = {
		itemType: "blogPost";
		title?: string;
		abstractNote?: string;
		blogTitle?: string;
		websiteType?: string;
		date?: string;
		url?: string;
		accessDate?: string;
		language?: string;
		shortTitle?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"author" | "commenter" | "contributor">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type BookItem = {
		itemType: "book";
		title?: string;
		abstractNote?: string;
		series?: string;
		seriesNumber?: string;
		volume?: string;
		numberOfVolumes?: string;
		edition?: string;
		place?: string;
		publisher?: string;
		date?: string;
		numPages?: string;
		language?: string;
		ISBN?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			"author" | "contributor" | "editor" | "translator" | "seriesEditor"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type BookSectionItem = {
		itemType: "bookSection";
		title?: string;
		abstractNote?: string;
		bookTitle?: string;
		series?: string;
		seriesNumber?: string;
		volume?: string;
		numberOfVolumes?: string;
		edition?: string;
		place?: string;
		publisher?: string;
		date?: string;
		pages?: string;
		language?: string;
		ISBN?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			| "author"
			| "contributor"
			| "editor"
			| "bookAuthor"
			| "translator"
			| "seriesEditor"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type CaseItem = {
		itemType: "case";
		caseName?: string;
		abstractNote?: string;
		court?: string;
		dateDecided?: string;
		docketNumber?: string;
		reporter?: string;
		reporterVolume?: string;
		firstPage?: string;
		history?: string;
		language?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"author" | "counsel" | "contributor">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type ComputerProgramItem = {
		itemType: "computerProgram";
		title?: string;
		abstractNote?: string;
		seriesTitle?: string;
		versionNumber?: string;
		date?: string;
		system?: string;
		place?: string;
		company?: string;
		programmingLanguage?: string;
		ISBN?: string;
		shortTitle?: string;
		url?: string;
		rights?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		accessDate?: string;
		extra?: string;

		creators: Creator<"programmer" | "contributor">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type ConferencePaperItem = {
		itemType: "conferencePaper";
		title?: string;
		abstractNote?: string;
		date?: string;
		proceedingsTitle?: string;
		conferenceName?: string;
		place?: string;
		publisher?: string;
		volume?: string;
		pages?: string;
		series?: string;
		language?: string;
		DOI?: string;
		ISBN?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			"author" | "contributor" | "editor" | "translator" | "seriesEditor"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type DatasetItem = {
		itemType: "dataset";
		title?: string;
		abstractNote?: string;
		identifier?: string;
		type?: string;
		versionNumber?: string;
		date?: string;
		repository?: string;
		repositoryLocation?: string;
		format?: string;
		DOI?: string;
		citationKey?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		shortTitle?: string;
		language?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"author" | "contributor">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type DictionaryEntryItem = {
		itemType: "dictionaryEntry";
		title?: string;
		abstractNote?: string;
		dictionaryTitle?: string;
		series?: string;
		seriesNumber?: string;
		volume?: string;
		numberOfVolumes?: string;
		edition?: string;
		place?: string;
		publisher?: string;
		date?: string;
		pages?: string;
		language?: string;
		ISBN?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			"author" | "contributor" | "editor" | "translator" | "seriesEditor"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type DocumentItem = {
		itemType: "document";
		title?: string;
		abstractNote?: string;
		publisher?: string;
		date?: string;
		language?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			| "author"
			| "contributor"
			| "editor"
			| "translator"
			| "reviewedAuthor"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type EmailItem = {
		itemType: "email";
		subject?: string;
		abstractNote?: string;
		date?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		language?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"author" | "contributor" | "recipient">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type EncyclopediaArticleItem = {
		itemType: "encyclopediaArticle";
		title?: string;
		abstractNote?: string;
		encyclopediaTitle?: string;
		series?: string;
		seriesNumber?: string;
		volume?: string;
		numberOfVolumes?: string;
		edition?: string;
		place?: string;
		publisher?: string;
		date?: string;
		pages?: string;
		ISBN?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		language?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			"author" | "contributor" | "editor" | "translator" | "seriesEditor"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type FilmItem = {
		itemType: "film";
		title?: string;
		abstractNote?: string;
		distributor?: string;
		date?: string;
		genre?: string;
		videoRecordingFormat?: string;
		runningTime?: string;
		language?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			"director" | "contributor" | "scriptwriter" | "producer"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type ForumPostItem = {
		itemType: "forumPost";
		title?: string;
		abstractNote?: string;
		forumTitle?: string;
		postType?: string;
		date?: string;
		language?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"author" | "contributor">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type HearingItem = {
		itemType: "hearing";
		title?: string;
		abstractNote?: string;
		committee?: string;
		place?: string;
		publisher?: string;
		numberOfVolumes?: string;
		documentNumber?: string;
		pages?: string;
		legislativeBody?: string;
		session?: string;
		history?: string;
		date?: string;
		language?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"contributor">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type InstantMessageItem = {
		itemType: "instantMessage";
		title?: string;
		abstractNote?: string;
		date?: string;
		language?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"author" | "contributor" | "recipient">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type InterviewItem = {
		itemType: "interview";
		title?: string;
		abstractNote?: string;
		date?: string;
		interviewMedium?: string;
		language?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			"interviewee" | "contributor" | "interviewer" | "translator"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type JournalArticleItem = {
		itemType: "journalArticle";
		title?: string;
		abstractNote?: string;
		publicationTitle?: string;
		volume?: string;
		issue?: string;
		pages?: string;
		date?: string;
		series?: string;
		seriesTitle?: string;
		seriesText?: string;
		journalAbbreviation?: string;
		language?: string;
		DOI?: string;
		ISSN?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			| "author"
			| "contributor"
			| "editor"
			| "translator"
			| "reviewedAuthor"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type LetterItem = {
		itemType: "letter";
		title?: string;
		abstractNote?: string;
		letterType?: string;
		date?: string;
		language?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"author" | "contributor" | "recipient">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type MagazineArticleItem = {
		itemType: "magazineArticle";
		title?: string;
		abstractNote?: string;
		publicationTitle?: string;
		volume?: string;
		issue?: string;
		date?: string;
		pages?: string;
		language?: string;
		ISSN?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			"author" | "contributor" | "translator" | "reviewedAuthor"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type ManuscriptItem = {
		itemType: "manuscript";
		title?: string;
		abstractNote?: string;
		manuscriptType?: string;
		place?: string;
		date?: string;
		numPages?: string;
		language?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"author" | "contributor" | "translator">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type MapItem = {
		itemType: "map";
		title?: string;
		abstractNote?: string;
		mapType?: string;
		scale?: string;
		seriesTitle?: string;
		edition?: string;
		place?: string;
		publisher?: string;
		date?: string;
		language?: string;
		ISBN?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"cartographer" | "contributor" | "seriesEditor">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type NewspaperArticleItem = {
		itemType: "newspaperArticle";
		title?: string;
		abstractNote?: string;
		publicationTitle?: string;
		place?: string;
		edition?: string;
		date?: string;
		section?: string;
		pages?: string;
		language?: string;
		shortTitle?: string;
		ISSN?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			"author" | "contributor" | "translator" | "reviewedAuthor"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type PatentItem = {
		itemType: "patent";
		title?: string;
		abstractNote?: string;
		place?: string;
		country?: string;
		assignee?: string;
		issuingAuthority?: string;
		patentNumber?: string;
		filingDate?: string;
		pages?: string;
		applicationNumber?: string;
		priorityNumbers?: string;
		issueDate?: string;
		references?: string;
		legalStatus?: string;
		language?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"inventor" | "attorneyAgent" | "contributor">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type PodcastItem = {
		itemType: "podcast";
		title?: string;
		abstractNote?: string;
		seriesTitle?: string;
		episodeNumber?: string;
		audioFileType?: string;
		runningTime?: string;
		url?: string;
		accessDate?: string;
		language?: string;
		shortTitle?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"podcaster" | "contributor" | "guest">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type PreprintItem = {
		itemType: "preprint";
		title?: string;
		abstractNote?: string;
		genre?: string;
		repository?: string;
		archiveID?: string;
		place?: string;
		date?: string;
		series?: string;
		seriesNumber?: string;
		DOI?: string;
		citationKey?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		shortTitle?: string;
		language?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			| "author"
			| "contributor"
			| "editor"
			| "translator"
			| "reviewedAuthor"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type PresentationItem = {
		itemType: "presentation";
		title?: string;
		abstractNote?: string;
		presentationType?: string;
		date?: string;
		place?: string;
		meetingName?: string;
		url?: string;
		accessDate?: string;
		language?: string;
		shortTitle?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"presenter" | "contributor">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type RadioBroadcastItem = {
		itemType: "radioBroadcast";
		title?: string;
		abstractNote?: string;
		programTitle?: string;
		episodeNumber?: string;
		audioRecordingFormat?: string;
		place?: string;
		network?: string;
		date?: string;
		runningTime?: string;
		language?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			| "director"
			| "scriptwriter"
			| "producer"
			| "castMember"
			| "contributor"
			| "guest"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type ReportItem = {
		itemType: "report";
		title?: string;
		abstractNote?: string;
		reportNumber?: string;
		reportType?: string;
		seriesTitle?: string;
		place?: string;
		institution?: string;
		date?: string;
		pages?: string;
		language?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			"author" | "contributor" | "translator" | "seriesEditor"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type StandardItem = {
		itemType: "standard";
		title?: string;
		abstractNote?: string;
		organization?: string;
		committee?: string;
		type?: string;
		number?: string;
		versionNumber?: string;
		status?: string;
		date?: string;
		publisher?: string;
		place?: string;
		DOI?: string;
		citationKey?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		shortTitle?: string;
		numPages?: string;
		language?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"author" | "contributor">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type StatuteItem = {
		itemType: "statute";
		nameOfAct?: string;
		abstractNote?: string;
		code?: string;
		codeNumber?: string;
		publicLawNumber?: string;
		dateEnacted?: string;
		pages?: string;
		section?: string;
		session?: string;
		history?: string;
		language?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"author" | "contributor">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type ThesisItem = {
		itemType: "thesis";
		title?: string;
		abstractNote?: string;
		thesisType?: string;
		university?: string;
		place?: string;
		date?: string;
		numPages?: string;
		language?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"author" | "contributor">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type TVBroadcastItem = {
		itemType: "tvBroadcast";
		title?: string;
		abstractNote?: string;
		programTitle?: string;
		episodeNumber?: string;
		videoRecordingFormat?: string;
		place?: string;
		network?: string;
		date?: string;
		runningTime?: string;
		language?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			| "director"
			| "scriptwriter"
			| "producer"
			| "castMember"
			| "contributor"
			| "guest"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type VideoRecordingItem = {
		itemType: "videoRecording";
		title?: string;
		abstractNote?: string;
		videoRecordingFormat?: string;
		seriesTitle?: string;
		volume?: string;
		numberOfVolumes?: string;
		place?: string;
		studio?: string;
		date?: string;
		runningTime?: string;
		language?: string;
		ISBN?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		archive?: string;
		archiveLocation?: string;
		libraryCatalog?: string;
		callNumber?: string;
		rights?: string;
		extra?: string;

		creators: Creator<
			| "director"
			| "scriptwriter"
			| "producer"
			| "castMember"
			| "contributor"
		>[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type WebpageItem = {
		itemType: "webpage";
		title?: string;
		abstractNote?: string;
		websiteTitle?: string;
		websiteType?: string;
		date?: string;
		shortTitle?: string;
		url?: string;
		accessDate?: string;
		language?: string;
		rights?: string;
		extra?: string;

		creators: Creator<"author" | "contributor" | "translator">[];
		attachments?: Attachment[];
		tags: Tag[];
		notes?: Note[];
		seeAlso?: string[];
		complete(): void;

		[key: string]: string;
	};

	type CreatorType =
		| "artist"
		| "attorneyAgent"
		| "author"
		| "bookAuthor"
		| "cartographer"
		| "castMember"
		| "commenter"
		| "composer"
		| "contributor"
		| "cosponsor"
		| "counsel"
		| "director"
		| "editor"
		| "guest"
		| "interviewee"
		| "interviewer"
		| "inventor"
		| "performer"
		| "podcaster"
		| "presenter"
		| "producer"
		| "programmer"
		| "recipient"
		| "reviewedAuthor"
		| "scriptwriter"
		| "seriesEditor"
		| "sponsor"
		| "translator"
		| "wordsBy";
	/* *** END GENERATED TYPES *** */

	interface Note {
		title?: string;
		note: string;
	}

	interface Collection {}

	interface Translator {
		[key: string]: any; // allow for exports
	}

	interface WebTranslator extends Translator {
		detectWeb(doc: Document, url: string): ItemType | "multiple" | false;
		doWeb(doc: Document, url: string): void | Promise<void>;

		// strongly type commonly-used translator exports
		itemType?: ItemType;
	}

	interface ImportTranslator extends Translator {
		detectImport(): boolean;
		doImport(): void;
	}

	interface ExportTranslator extends Translator {
		doExport(): void;
	}

	interface SearchTranslator extends Translator {
		detectSearch(
			items: ZoteroTranslators.Item[] | ZoteroTranslators.Item,
		): boolean;
		doSearch(
			items: ZoteroTranslators.Item[] | ZoteroTranslators.Item,
		): void;
	}

	interface Translate<T extends Translator> {
		setTranslator(translator: T[] | T | string): boolean;
		getTranslatorObject(): Promise<T>;
		getTranslatorObject(receiver: (obj: T) => void): void;
		setHandler(
			type: "select",
			handler: (
				translate: ZoteroTranslators.Translate<T>,
				items: { [id: string]: string },
			) => string[],
		): void;
		setHandler(
			type: "itemDone",
			handler: (
				translate: ZoteroTranslators.Translate<T>,
				item: ZoteroTranslators.Item,
			) => void,
		): void;
		setHandler(
			type: "collectionDone",
			handler: (
				translate: ZoteroTranslators.Translate,
				collection: ZoteroTranslators.Collection,
			) => void,
		): void;
		setHandler(
			type: "done",
			handler: (
				translate: ZoteroTranslators.Translate<T>,
				success: boolean,
			) => void,
		): void;
		setHandler(
			type: "debug",
			handler: (
				translate: ZoteroTranslators.Translate<T>,
				message: string,
			) => boolean,
		): void;
		setHandler(
			type: "error",
			handler: (
				translate: ZoteroTranslators.Translate<T>,
				error: Error | string,
			) => void,
		): void;
		setHandler(
			type: "translators",
			handler: (
				translate: ZoteroTranslators.Translate<T>,
				translators: T[],
			) => void,
		): void;
		setHandler(
			type: "pageModified",
			handler: (
				translate: ZoteroTranslators.Translate<T>,
				doc: Document,
			) => void,
		): void;
		clearHandlers(
			type:
				| "select"
				| "itemDone"
				| "collectionDone"
				| "done"
				| "debug"
				| "error"
				| "translators"
				| "pageModified",
		): void;
		removeHandler(
			type: "select",
			handler: (
				translate: ZoteroTranslators.Translate<T>,
				items: { [id: string]: string },
			) => string[],
		): void;
		removeHandler(
			type: "itemDone",
			handler: (
				translate: ZoteroTranslators.Translate<T>,
				item: ZoteroTranslators.Item,
			) => void,
		): void;
		removeHandler(
			type: "collectionDone",
			handler: (
				translate: ZoteroTranslators.Translate<T>,
				collection: ZoteroTranslators.Collection,
			) => void,
		): void;
		removeHandler(
			type: "done",
			handler: (
				translate: ZoteroTranslators.Translate<T>,
				success: boolean,
			) => void,
		): void;
		removeHandler(
			type: "debug",
			handler: (
				translate: ZoteroTranslators.Translate<T>,
				message: string,
			) => boolean,
		): void;
		removeHandler(
			type: "error",
			handler: (
				translate: ZoteroTranslators.Translate<T>,
				error: Error | string,
			) => void,
		): void;
		removeHandler(
			type: "translators",
			handler: (
				translate: ZoteroTranslators.Translate<T>,
				translators: T[],
			) => void,
		): void;
		removeHandler(
			type: "pageModified",
			handler: (
				translate: ZoteroTranslators.Translate<T>,
				doc: Document,
			) => void,
		): void;
		getTranslators(
			getAllTranslators?: boolean,
			checkSetTranslator?: boolean,
		): Promise<T[]>;
		translate(options: TranslateOptions): Promise<ZoteroTranslators.Item[]>;
		setDocument(doc: Document): void;
		setString(s: string): void;
		setItems(items: ZoteroTranslators.Item[]): void;
		setSearch(item: ZoteroTranslators.Item): void;
	}

	interface TranslateOptions {
		libraryID?: number | false;
		//sessionID?: string;
		//selectedItems?: any
		saveAttachments?: boolean; // true by default
		linkFiles?: boolean; // false by default
		collections?: number[];
		forceTagType?: boolean;
	}

	// common
	function getOption(option: string): any;
	function getHiddenPref(pref: string): any;
	function loadTranslator(
		translatorType: "web",
	): ZoteroTranslators.Translate<WebTranslator>;
	function loadTranslator(
		translatorType: "import",
	): ZoteroTranslators.Translate<ImportTranslator>;
	function loadTranslator(
		translatorType: "export",
	): ZoteroTranslators.Translate<ExportTranslator>;
	function loadTranslator(
		translatorType: "search",
	): ZoteroTranslators.Translate<SearchTranslator>;
	function done(returnValue: string | false): void;
	function debug(str: string, level?: 1 | 2 | 3 | 4 | 5): void;
	function read(length?: number): any;
	function getXML(): any;

	const isBookmarklet: boolean;
	const isConnector: boolean;
	const isServer: boolean;
	const parentTranslator: string?;

	// web
	function selectItems(
		items: Record<string, string>,
	): Promise<Record<string, string>?>;
	function selectItems(
		items: Record<string, string>,
		callback: (items: Record<string, string>?) => void,
	): void;
	function monitorDOMChanges(
		target: Node,
		config: MutationObserverInit,
	): void;

	// import & export
	function setProgress(value: number): void;

	// export
	function nextItem(): ZoteroTranslators.Item?;
	function nextCollection(): ZoteroTranslators.Collection?;
}

declare function attr(
	node: ParentNode,
	selector: string,
	attr: string,
	index?: number,
): string;
declare function attr(selector: string, attr: string, index?: number): string;
declare function text(
	node: ParentNode,
	selector: string,
	index?: number,
): string;
declare function text(selector: string, index?: number): string;
declare function innerText(
	node: ParentNode,
	selector: string,
	index?: number,
): string;
declare function innerText(selector: string, index?: number): string;

declare const request = ZU.request;
declare const requestText = ZU.requestText;
declare const requestJSON = ZU.requestJSON;
declare const requestDocument = ZU.requestDocument;
