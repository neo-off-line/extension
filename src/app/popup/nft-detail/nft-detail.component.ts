import { Component, OnInit } from '@angular/core';
import {
    GlobalService,
    NftState,
    NeonService,
    ChromeService,
} from '@/app/core';
import { ActivatedRoute } from '@angular/router';
import { NftAsset } from '@/models/models';

@Component({
    templateUrl: 'nft-detail.component.html',
    styleUrls: ['nft-detail.component.scss'],
})
export class PopupNftDetailComponent implements OnInit {
    nftContract: string;
    nft: NftAsset;
    selectedIndex = 0;
    // 菜单
    showMenu = false;

    constructor(
        private aRouter: ActivatedRoute,
        private global: GlobalService,
        private nftState: NftState,
        private neonService: NeonService,
        private chrome: ChromeService
    ) {}

    ngOnInit(): void {
        this.aRouter.params.subscribe(async (params: any) => {
            this.nftContract = params.contract;
            this.getData();
        });
    }

    getData() {
        this.nftState
            .getNftTokens(this.neonService.address, this.nftContract)
            .then((res) => {
                this.nft = res;
                if (!this.nft) {
                    this.chrome
                        .getNftWatch(
                            this.global.n3Network.id,
                            this.neonService.address
                        )
                        .subscribe((res2) => {
                            this.nft = res2.find(
                                (m) => m.assethash === this.nftContract
                            );
                        });
                }
            });
    }

    toWeb() {
        this.showMenu = false;
        if (this.global.n3Network.explorer) {
            window.open(
                `${this.global.n3Network.explorer}tokens/nft/${this.nftContract}`
            );
        }
    }
}
